// Every tunable number in the game lives here. No magic numbers in logic files.

export const TICK_SEC = 0.1; // fixed simulation timestep, in game-seconds
export const MAX_ACCUMULATOR_SEC = 1.0; // clamp so a slow frame can't spiral
export const FRAME_GAP_THRESHOLD_SEC = 5; // beyond this, treat as a hidden-tab gap
export const AUTOSAVE_INTERVAL_MS = 15_000;

export const BASE_STATS = {
  critChance: 0.3,
  critChanceCap: 0.95,
  critMult: 2.0,
  orePerHit: 1,
  offlineRate: 0.5,
  mineSlots: 1,
  arenaSlots: 1,
  buffDurationSec: 10,
} as const;

export const ARENA_BASE = {
  baseEnemyHp: 30,
  enemyHpGrowth: 1.18,
  baseEnemyAttack: 3,
  enemyAttackGrowth: 1.15,
  enemyAttackSpeed: 0.8,
  bossInterval: 10,
  bossHpMult: 3,
} as const;
