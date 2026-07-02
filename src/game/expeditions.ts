import { EXPEDITIONS } from "./balance";
import { expeditionFailReductionOf, expeditionPowerOf } from "./ducks";
import { emit } from "./events";
import { applyReward, grantXp } from "./state";
import type { DerivedStats, ExpeditionDuration, GameState, MaterialId, Rng } from "./types";
import { MATERIAL_BY_WAVE_INDEX } from "./balance";

let nextExpeditionId = 1;

// A duck is "away" (unavailable to mine/arena/pond rosters) while it's on
// any expedition that hasn't been claimed yet.
export function isDuckOnExpedition(state: GameState, defId: string): boolean {
  return state.expeditions.some((e) => e.ducks.includes(defId));
}

function totalPower(state: GameState, defIds: string[]): number {
  let total = 0;
  for (const defId of defIds) {
    const duck = state.ducks.find((d) => d.defId === defId);
    if (duck) total += expeditionPowerOf(state, duck);
  }
  return total;
}

function avgLevel(state: GameState, defIds: string[]): number {
  const levels = defIds.map((id) => state.ducks.find((d) => d.defId === id)?.level ?? 1);
  return levels.reduce((a, b) => a + b, 0) / Math.max(levels.length, 1);
}

// clamp(0.35 − 0.03 × avgDuckLevel − trait bonuses, 5%, 60%) (PLAN2.md §11).
export function expeditionFailChance(state: GameState, defIds: string[]): number {
  const traitReduction = defIds.reduce((sum, id) => {
    const duck = state.ducks.find((d) => d.defId === id);
    return sum + (duck ? expeditionFailReductionOf(duck) : 0);
  }, 0);
  const raw = EXPEDITIONS.fail.base - EXPEDITIONS.fail.perLevel * avgLevel(state, defIds) - traitReduction;
  return Math.min(Math.max(raw, EXPEDITIONS.fail.min), EXPEDITIONS.fail.max);
}

// Sends a roster of owned, currently-free ducks on a journey. Returns false
// if the roster is empty, oversized, includes an unowned/busy duck, or the
// duration is invalid.
export function startExpedition(
  state: GameState,
  duration: ExpeditionDuration,
  defIds: string[],
  nowMs: number,
): boolean {
  const hours = EXPEDITIONS.durations[duration]?.hours;
  if (!hours) return false;
  if (defIds.length === 0 || defIds.length > EXPEDITIONS.rosterSize) return false;
  if (new Set(defIds).size !== defIds.length) return false;
  for (const defId of defIds) {
    if (!state.ducks.some((d) => d.defId === defId)) return false;
    if (isDuckOnExpedition(state, defId)) return false;
  }

  // Sent ducks step out of whatever roster they were in (mine/arena/pond).
  for (const panel of ["mine", "arena", "pond"] as const) {
    state.rosters[panel] = state.rosters[panel].filter((id) => !defIds.includes(id));
  }

  state.expeditions.push({
    id: `exp${nextExpeditionId++}`,
    duration,
    ducks: [...defIds],
    startedAt: nowMs,
    endsAt: nowMs + hours * 3600 * 1000,
  });
  emit("roster", {});
  return true;
}

export interface ExpeditionResult {
  success: boolean;
  isCrit: boolean;
  gold: number;
  xp: number;
  shardPoints: number;
  materials: MaterialId[];
  gotPack: boolean;
}

// Resolves a finished expedition: rolls fail chance, then (on success) crit
// chance for double rewards. Removes the instance and frees its ducks.
export function claimExpedition(
  state: GameState,
  expeditionId: string,
  nowMs: number,
  rng: Rng,
  stats: DerivedStats,
): ExpeditionResult | null {
  const exp = state.expeditions.find((e) => e.id === expeditionId);
  if (!exp || nowMs < exp.endsAt) return null;

  const hours = EXPEDITIONS.durations[exp.duration].hours;
  const power = totalPower(state, exp.ducks);
  const success = rng.next() >= expeditionFailChance(state, exp.ducks);
  const isCrit = success && rng.next() < stats.critChance;
  const critMult = isCrit ? EXPEDITIONS.critMult : 1;

  const baseGold = power * EXPEDITIONS.goldPerPowerPerHour * hours * stats.goldMult;
  const baseXp = power * EXPEDITIONS.xpPerPowerPerHour * hours * stats.xpMult;
  const payoutMult = success ? critMult : EXPEDITIONS.failPayoutMult;

  const gold = baseGold * payoutMult;
  const xp = baseXp * payoutMult;
  const materials: MaterialId[] = [];
  let shardPoints = 0;
  let gotPack = false;

  if (success) {
    const materialChance = power * EXPEDITIONS.materialChancePerPowerPerHour * hours * critMult;
    if (rng.next() < materialChance) {
      materials.push(MATERIAL_BY_WAVE_INDEX[Math.floor(rng.next() * MATERIAL_BY_WAVE_INDEX.length)]);
    }
    shardPoints = Math.round(power * EXPEDITIONS.shardPointsPerPowerPerHour * hours * critMult);
    const packChance = Math.min(EXPEDITIONS.packChancePerHour * hours * critMult, EXPEDITIONS.packChanceCap);
    gotPack = rng.next() < packChance;
  }

  applyReward(state, { gold, shardPoints, packCredits: gotPack ? { standard: 1 } : undefined });
  grantXp(state, xp);
  for (const material of materials) state.materials[material] += 1;

  state.expeditions = state.expeditions.filter((e) => e.id !== expeditionId);
  emit("expeditionClaimed", { success, isCrit, gold, xp });
  return { success, isCrit, gold, xp, shardPoints, materials, gotPack };
}

// Fires a one-time "expeditionReady" event per journey the instant its
// endsAt passes while the game is open (a toast nudge; claiming is still a
// manual UI action so offline ones sit ready until opened).
export function checkExpeditions(state: GameState, nowMs: number): void {
  for (const exp of state.expeditions) {
    if (!exp.readyNotified && nowMs >= exp.endsAt) {
      exp.readyNotified = true;
      emit("expeditionReady", { id: exp.id });
    }
  }
}
