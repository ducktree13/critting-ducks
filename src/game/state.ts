import { ARENA_BASE, BASE_STATS, PASSIVES, STREAK_BALANCE, XP_CURVE } from "./balance";
import { getDuckDef, makeOwnedDuck } from "./ducks";
import { emit } from "./events";
import { getSkillNode } from "./skilltree";
import type { DerivedStats, GameState, OreId } from "./types";

export function createInitialState(): GameState {
  const now = Date.now();
  const ores: Record<OreId, number> = { copper: 0, silver: 0, crystal: 0, starmetal: 0 };
  return {
    version: 2,
    gold: 0,
    xp: 0,
    level: 1,
    lifetime: { gold: 0, crits: 0, hits: 0, packs: 0 },
    ores,
    selectedOre: "copper",
    ducks: [makeOwnedDuck("bill"), makeOwnedDuck("quackers")],
    rosters: { mine: ["bill"], arena: ["quackers"] },
    skillNodes: [],
    streak: {
      current: 0,
      best: 0,
      buffExpiry: { t10: 0, t25: 0, t50: 0, t100: 0 },
      shieldReadyAt: 0,
    },
    arena: {
      wave: 1,
      enemyHp: ARENA_BASE.baseEnemyHp,
      enemyMaxHp: ARENA_BASE.baseEnemyHp,
      enemyNextHitIn: 1 / ARENA_BASE.enemyAttackSpeed,
      teamHp: 0,
      teamMaxHp: 0,
      retryAt: 0,
    },
    settings: { darkMode: false },
    lastSaved: now,
    createdAt: now,
  };
}

export function xpToNext(level: number): number {
  return XP_CURVE.base * Math.pow(XP_CURVE.growth, level - 1);
}

// Adds XP and resolves level-ups (possibly several at once).
export function grantXp(state: GameState, amount: number): void {
  state.xp += amount;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level += 1;
    emit("levelup", { level: state.level });
  }
}

// Assign an owned duck to a roster slot (or clear it with null). A duck can
// only be in one roster at a time, so assigning removes it from wherever it
// currently sits.
export function assignToRoster(
  state: GameState,
  panel: "mine" | "arena",
  slotIndex: number,
  defId: string | null,
): boolean {
  const stats = getStats(state);
  const slots = panel === "mine" ? stats.mineSlots : stats.arenaSlots;
  if (slotIndex < 0 || slotIndex >= slots) return false;
  if (defId !== null && !state.ducks.some((d) => d.defId === defId)) return false;

  if (defId !== null) {
    for (const p of ["mine", "arena"] as const) {
      const i = state.rosters[p].indexOf(defId);
      if (i !== -1) state.rosters[p].splice(i, 1);
    }
  }

  const roster = state.rosters[panel];
  if (defId === null) {
    roster.splice(slotIndex, 1);
  } else if (slotIndex < roster.length) {
    roster[slotIndex] = defId;
  } else {
    roster.push(defId);
  }
  emit("roster", {});
  return true;
}

// Aggregates base values, purchased skill nodes, rostered duck passives, and
// active streak buffs into one derived-stats snapshot. Skill nodes fold in
// when the tree lands in Phase 3.
export function computeStats(state: GameState, nowMs: number): DerivedStats {
  const stats: DerivedStats = {
    critChance: BASE_STATS.critChance,
    critMult: BASE_STATS.critMult,
    orePerHit: BASE_STATS.orePerHit,
    oreMult: 1,
    attackDamageMult: 1,
    flatAttack: 0,
    attackSpeedMult: 1,
    mineSpeedMult: 1,
    arenaSpeedMult: 1,
    defenseMult: 1,
    flatDefense: 0,
    xpMult: 1,
    goldMult: 1,
    mineSlots: BASE_STATS.mineSlots,
    arenaSlots: BASE_STATS.arenaSlots,
    offlineRate: BASE_STATS.offlineRate,
    buffDurationSec: BASE_STATS.buffDurationSec,
    unlockedOres: ["copper"],
  };

  // Purchased skill nodes fold in declaratively by effect kind.
  for (const id of state.skillNodes) {
    const effect = getSkillNode(id).effect;
    switch (effect.kind) {
      case "stat":
        if ("add" in effect) stats[effect.stat] += effect.add;
        else stats[effect.stat] *= effect.mult;
        break;
      case "slot":
        if (effect.panel === "mine") stats.mineSlots += 1;
        else stats.arenaSlots += 1;
        break;
      case "oreUnlock":
        stats.unlockedOres.push(effect.ore);
        break;
      case "offline":
        stats.offlineRate = Math.max(stats.offlineRate, effect.rate);
        break;
      case "buffDuration":
        stats.buffDurationSec = effect.seconds;
        break;
    }
  }

  // Team passives apply while the duck is rostered in the panel it affects.
  for (const defId of state.rosters.mine) {
    if (getDuckDef(defId).passive === "teamOre10") stats.oreMult *= PASSIVES.teamOreMult;
  }
  for (const defId of state.rosters.arena) {
    if (getDuckDef(defId).passive === "teamDmg10") stats.attackDamageMult *= PASSIVES.teamDmgMult;
  }

  // Streak tier buffs, active while their real-time expiry is in the future.
  const expiry = state.streak.buffExpiry;
  if (nowMs < expiry.t10) stats.goldMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t25) stats.xpMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t50) stats.attackDamageMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t100) {
    stats.critChance += STREAK_BALANCE.quackeningCritBonus;
    stats.oreMult *= STREAK_BALANCE.quackeningMult;
    stats.attackDamageMult *= STREAK_BALANCE.quackeningMult;
    stats.attackSpeedMult *= STREAK_BALANCE.quackeningMult;
    stats.xpMult *= STREAK_BALANCE.quackeningMult;
    stats.goldMult *= STREAK_BALANCE.quackeningMult;
  }
  stats.critChance = Math.min(Math.max(stats.critChance, 0), BASE_STATS.critChanceCap);

  return stats;
}

// computeStats is called once per logic tick and cached here; the UI reads
// the same snapshot instead of recomputing per frame.
let cachedStats: DerivedStats | null = null;

export function refreshStats(state: GameState, nowMs: number): DerivedStats {
  cachedStats = computeStats(state, nowMs);
  return cachedStats;
}

export function getStats(state: GameState): DerivedStats {
  return cachedStats ?? refreshStats(state, Date.now());
}
