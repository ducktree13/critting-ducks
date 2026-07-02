// Every tunable number in the game lives here. No magic numbers in logic files.

import type { OreId, Rarity } from "./types";

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

export const ORE_VALUES: Record<OreId, number> = {
  copper: 1,
  silver: 3,
  crystal: 8,
  starmetal: 20,
};

export const DUCK_LEVEL_STAT_BONUS = 0.1; // +10% base stats per level above 1
export const DUCK_MAX_LEVEL = 10;

export const XP_CURVE = { base: 100, growth: 1.5 } as const; // xpToNext(level) = base * growth^(level-1)
export const MINE_XP_PER_HIT = 1;

export const RATE_WINDOW_SEC = 120; // rolling window for gold/hr and xp/hr

export const PASSIVES = {
  teamOreMult: 1.1, // Drillbert: +10% team ore per hit (mine)
  teamDmgMult: 1.1, // Thunderquack: +10% team damage (arena)
  goldenCritGoldMult: 2, // Golden Goose: mine crits pay +100% gold
  streakShieldCooldownMs: 60_000, // Deathbill: 1 non-crit forgiven per 60s
} as const;

export const GACHA = {
  standardPackCost: 100, // 1 roll
  fivePackCost: 450, // 5 rolls, guaranteed uncommon-or-better
  fivePackRolls: 5,
  odds: { common: 0.6, uncommon: 0.25, rare: 0.1, epic: 0.04, legendary: 0.01 } as Record<Rarity, number>,
  dupeShards: { common: 1, uncommon: 2, rare: 3, epic: 5, legendary: 10 } as Record<Rarity, number>,
} as const;

export const STREAK_BALANCE = {
  tiers: { t10: 10, t25: 25, t50: 50, t100: 100 },
  speedPerCrit: 0.01, // gameSpeed = 1 + speedPerCrit * min(streak, speedCap)
  speedCap: 100, // streak count where speed maxes out (2.0x)
  tierBuffMult: 1.5, // T10 gold, T25 xp, T50 arena damage
  quackeningMult: 1.25, // T100: all multipliers
  quackeningCritBonus: 0.1, // T100: flat crit chance, within cap
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
