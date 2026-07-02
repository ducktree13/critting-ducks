import { ARENA_BASE, BASE_STATS, PASSIVES, XP_CURVE } from "./balance";
import { getDuckDef, makeOwnedDuck } from "./ducks";
import { emit } from "./events";
import type { DerivedStats, GameState, OreId } from "./types";

export function createInitialState(): GameState {
  const now = Date.now();
  const ores: Record<OreId, number> = { copper: 0, silver: 0, crystal: 0, starmetal: 0 };
  return {
    version: 1,
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

// Aggregates base values, purchased skill nodes, rostered duck passives, and
// active streak buffs into one derived-stats snapshot. Skill nodes (Phase 3)
// and streak buffs (Phase 2) fold in as those systems come online.
export function computeStats(state: GameState, _nowMs: number): DerivedStats {
  const stats: DerivedStats = {
    critChance: BASE_STATS.critChance,
    critMult: BASE_STATS.critMult,
    orePerHit: BASE_STATS.orePerHit,
    oreMult: 1,
    attackDamageMult: 1,
    flatAttack: 0,
    attackSpeedMult: 1,
    mineSpeedMult: 1,
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

  // Team passives apply while the duck is rostered in the panel it affects.
  for (const defId of state.rosters.mine) {
    if (getDuckDef(defId).passive === "teamOre10") stats.oreMult *= PASSIVES.teamOreMult;
  }
  for (const defId of state.rosters.arena) {
    if (getDuckDef(defId).passive === "teamDmg10") stats.attackDamageMult *= PASSIVES.teamDmgMult;
  }

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
