import { ARENA_BASE, BASE_STATS } from "./balance";
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
    ducks: [],
    rosters: { mine: [], arena: [] },
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

// Aggregates base values, purchased skill nodes, rostered duck passives, and
// active streak buffs into one derived-stats snapshot. Skill nodes/passives/
// buffs are folded in as those systems come online in later phases.
export function computeStats(_state: GameState, _nowMs: number): DerivedStats {
  return {
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
}
