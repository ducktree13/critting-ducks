// Every tunable number in the game lives here. No magic numbers in logic files.
// Pacing targets (PLAN2.md §1): tutorial ≤5 min, first rare+ duck ~20 min,
// Act 1 in 6–8 h, endgame at 1–2 months.

import type { MaterialId, OreId, PackId, Rarity } from "./types";

export const TICK_SEC = 0.1; // fixed simulation timestep, in game-seconds
export const MAX_ACCUMULATOR_SEC = 1.0; // clamp so a slow frame can't spiral
export const FRAME_GAP_THRESHOLD_SEC = 5; // beyond this, treat as a hidden-tab gap
export const AUTOSAVE_INTERVAL_MS = 15_000;

export const BASE_STATS = {
  critChance: 0.3,
  critChanceCap: 0.95,
  critMult: 2.0,
  orePerHit: 0.1, // Bill on copper ≈ 0.26 gold/sec expected
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
  voidstone: 60,
  aurorium: 150,
};

// Ores need both their unlock node AND this player level.
export const ORE_LEVEL_GATES: Record<OreId, number> = {
  copper: 1,
  silver: 5,
  crystal: 12,
  starmetal: 20,
  voidstone: 30,
  aurorium: 40,
};

export const DUCK_LEVEL_STAT_BONUS = 0.1; // +10% base stats per level above 1
export const DUCK_MAX_LEVEL = 10;
export const SHARD_CAP = 200; // per duck; overflow becomes Shard Points

export const XP_CURVE = { base: 100, growth: 1.6 } as const; // xpToNext(level) = base * growth^(level-1)
export const MINE_XP_PER_HIT = 1;

export const LEVEL_REWARDS = {
  goldPerLevel: 20, // every level-up: gold += goldPerLevel * newLevel
  packEveryLevels: 5, // every Nth level grants a free Standard Pack...
  fivePackLevels: [10, 20, 30, 40], // ...except these, which grant a Five-Pack
} as const;

export const RATE_WINDOW_SEC = 120; // rolling window for gold/hr and xp/hr

export const OFFLINE = {
  capSec: 8 * 3600, // max credited away time
  minGapSec: 60, // shorter absences are ignored on load
  fullRateGapSec: 15 * 60, // hidden-tab gaps run at 100% for this long
} as const;

export const PASSIVES = {
  teamOreMult: 1.1, // Drillbert: +10% team ore per hit (mine)
  teamDmgMult: 1.1, // Thunderquack: +10% team damage (arena)
  goldenCritGoldMult: 2, // Golden Goose: mine crits pay +100% gold
  streakShieldCooldownMs: 60_000, // Deathbill: 1 non-crit forgiven per 60s
} as const;

// Seven-tier gacha (PLAN2.md §2). No bulk discounts — bigger packs buy
// convenience and guarantees, not price breaks.
export const GACHA = {
  odds: {
    common: 0.55,
    uncommon: 0.27,
    rare: 0.12,
    epic: 0.045,
    legendary: 0.012,
    mythic: 0.0025,
    divine: 0.0005,
  } as Record<Rarity, number>,
  dupeShards: {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 5,
    legendary: 10,
    mythic: 25,
    divine: 60,
  } as Record<Rarity, number>,
  packs: {
    standard: { price: 150, rolls: 1, guarantee: null, minLevel: 1 },
    five: { price: 750, rolls: 5, guarantee: "uncommon", minLevel: 1 },
    pack25: { price: 3750, rolls: 25, guarantee: "rare", minLevel: 1 },
    pack100: { price: 15000, rolls: 100, guarantee: "epic", minLevel: 20 },
  } as Record<PackId, { price: number; rolls: number; guarantee: Rarity | null; minLevel: number }>,
  packCritMaxBonus: 3, // free bonus packs per purchase, crits can chain up to this
} as const;

export const STREAK_BALANCE = {
  tiers: { t10: 10, t25: 25, t50: 50, t100: 100 },
  speedPerCrit: 0.01, // gameSpeed = 1 + speedPerCrit * min(streak, speedCap)
  speedCap: 100, // streak count where speed maxes out (2.0x)
  tierBuffMult: 1.5, // T10 gold, T25 xp, T50 arena damage
  quackeningMult: 1.25, // T100: all multipliers
  quackeningCritBonus: 0.1, // T100: flat crit chance, within cap
} as const;

const RARITY_TIERS: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic", "divine"];

// Materials are themed to the enemy family they drop from (PLAN2.md §6);
// the boss (every 10th wave) always drops its own relic.
export const MATERIAL_BY_WAVE_INDEX: readonly MaterialId[] = [
  "slimeGoo", "gooseFeather", "golemCrumb", "sharkTooth",
];
export const BOSS_MATERIAL: MaterialId = "pondlordRelic";

export const MATERIAL_NAMES: Record<MaterialId, string> = {
  slimeGoo: "Slime Goo",
  gooseFeather: "Goose Feather",
  golemCrumb: "Golem Crumb",
  sharkTooth: "Shark Tooth",
  pondlordRelic: "Pondlord Relic",
};

export const GEAR = {
  materialDropChance: 0.35, // per normal kill; 1.0 (guaranteed) on boss waves
  equipmentDropChance: 0.03, // per normal kill; boss uses equipmentBossDropChance
  equipmentBossDropChance: 0.25,
  sellPrice: {
    common: 5, uncommon: 15, rare: 40, epic: 100, legendary: 250, mythic: 600, divine: 1500,
  } as Record<Rarity, number>,
  // Stat budget per rarity a rolled equipment item's bonuses are drawn from.
  statBudget: {
    common: 1, uncommon: 1.8, rare: 3.5, epic: 7, legendary: 13, mythic: 24, divine: 40,
  } as Record<Rarity, number>,
  dropRarityOdds: {
    common: 0.5, uncommon: 0.28, rare: 0.14, epic: 0.06, legendary: 0.018, mythic: 0.0015, divine: 0.0005,
  } as Record<Rarity, number>,
} as const;

export const RARITY_ORDER: readonly Rarity[] = RARITY_TIERS;

export const ASCENSION = {
  maxAscensions: 3,
  statMultPerAscension: 0.25, // +25% to base stats per ascension
  // Cost formula (PLAN2.md §4): 2x the duck's dupe-shard value x10.
  shardCostMult: 20,
} as const;

// Falling leaves (PLAN2.md §9): every 3–6 real-time minutes a leaf drops
// from the (grown) tree; clicking it pays out before it fades.
export const LEAVES = {
  minGapMs: 3 * 60 * 1000,
  maxGapMs: 6 * 60 * 1000,
  expiresAfterMs: 30 * 1000,
  critMult: 5,
  duckTreeChance: 0.005,
  goldPerLevel: 15, // reward scales with player level ("current income")
  xpPerLevel: 8,
  duckId: "duckTree",
} as const;

export const SHARD_SHOP = {
  slots: 4,
  restockPeriodMs: 12 * 3600 * 1000,
  divineMinLevel: 35,
  spPrice: {
    common: 50, uncommon: 100, rare: 200, epic: 400, legendary: 800, mythic: 2000, divine: 5000,
  } as Record<Rarity, number>,
} as const;

export const ARENA_BASE = {
  baseEnemyHp: 24,
  enemyHpGrowth: 1.16,
  baseEnemyAttack: 2.5,
  enemyAttackGrowth: 1.13,
  enemyAttackSpeed: 0.8, // hits/sec
  bossInterval: 10, // every Nth wave is a boss
  bossHpMult: 3,
  bossRewardMult: 2,
  baseGoldReward: 2,
  goldRewardGrowth: 1.12,
  baseXpReward: 5,
  xpRewardGrowth: 1.1,
  xpPerHit: 2,
  shardChance: 0.1, // per victory; 1.0 on boss waves
  retrySec: 3, // real-time pause after a wipe
  nextWaveDelaySec: 1, // real-time pause between waves
} as const;
