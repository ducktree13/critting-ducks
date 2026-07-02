import { MATERIAL_BY_WAVE_INDEX, POND } from "./balance";
import { passivePowerOf } from "./ducks";
import { grantXp } from "./state";
import type { DerivedStats, GameState, MaterialId, Rng } from "./types";

function totalPassivePower(state: GameState): number {
  let total = 0;
  for (const defId of state.rosters.pond) {
    const duck = state.ducks.find((d) => d.defId === defId);
    if (duck) total += passivePowerOf(state, duck);
  }
  return total;
}

// Expected gold/xp per second from the pond roster, for the offline
// calculation (no materials there — matches how mine's own offline income
// skips crit-only flourishes).
export function pondIncomePerSec(state: GameState, stats: DerivedStats): { goldPerSec: number; xpPerSec: number } {
  const power = totalPassivePower(state);
  return {
    goldPerSec: power * POND.goldPerPassivePowerPerSec * stats.goldMult,
    xpPerSec: power * POND.xpPerPassivePowerPerSec * stats.xpMult,
  };
}

// Ducks in the pond generate a steady trickle each tick — no hits, no
// crits, just gold + slow XP + an occasional material.
export function tickPond(state: GameState, dt: number, rng: Rng, stats: DerivedStats): void {
  const power = totalPassivePower(state);
  if (power <= 0) return;

  const gold = power * POND.goldPerPassivePowerPerSec * stats.goldMult * dt;
  state.gold += gold;
  state.lifetime.gold += gold;
  grantXp(state, power * POND.xpPerPassivePowerPerSec * stats.xpMult * dt);

  if (rng.next() < power * POND.materialChancePerPassivePowerPerSec * dt) {
    const material: MaterialId = MATERIAL_BY_WAVE_INDEX[Math.floor(rng.next() * MATERIAL_BY_WAVE_INDEX.length)];
    state.materials[material] += 1;
  }
}
