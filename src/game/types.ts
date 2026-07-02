export type OreId = "copper" | "silver" | "crystal" | "starmetal" | "voidstone" | "aurorium";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "divine";
export type Panel = "mine" | "arena";
export type PackId = "standard" | "five" | "pack25" | "pack100";
export type PassiveId = "teamOre10" | "teamDmg10" | "goldenCrit" | "streakShield";

export interface Rng {
  next(): number; // [0, 1)
}

export type LockKind = "mission" | "achievement" | "leaf" | "shop";

export interface DuckDef {
  id: string;
  name: string;
  rarity: Rarity;
  role: "miner" | "fighter" | "hybrid";
  miningPower: number;
  attackDamage: number;
  attacksPerSecond: number;
  hp: number;
  defense: number;
  critChanceBonus: number;
  critDamageBonus: number;
  passive?: PassiveId;
  lockedBy?: { kind: LockKind; id: string }; // absent from gacha pools until unlocked
}

// A one-shot payout applied by grantReward — shared by missions and
// achievements so both can use the same reward shape and application code.
export interface Reward {
  gold?: number;
  shardPoints?: number;
  packCredits?: Partial<Record<PackId, number>>;
  unlockDuck?: string;
}

export type MissionSection = "mine" | "tree" | "arena";

export interface MissionInstance {
  id: string;
  templateId: string;
  section: MissionSection;
  startValue: number;
  target: number;
  completed: boolean;
}

export interface OwnedDuck {
  defId: string;
  level: number;
  shards: number;
  nextHitIn: number;
  favorite?: boolean;
}

export interface StreakState {
  current: number;
  best: number;
  buffExpiry: { t10: number; t25: number; t50: number; t100: number };
  shieldReadyAt: number;
}

export interface ArenaState {
  wave: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyNextHitIn: number;
  teamHp: number;
  teamMaxHp: number;
  retryAt: number;
}

export interface GameState {
  version: 2;
  gold: number;
  xp: number;
  level: number;
  lifetime: { gold: number; crits: number; hits: number; packs: number };
  ores: Record<OreId, number>;
  selectedOre: OreId;
  ducks: OwnedDuck[];
  rosters: { mine: string[]; arena: string[] };
  skillNodes: string[];
  shardPoints: number;                       // overflow shards, spent in the shard shop
  packCredits: Record<PackId, number>;       // free packs from level rewards etc.
  unlockedDucks: string[];                   // defIds of lockedBy ducks the player has freed
  achievementsCompleted: string[];
  missions: Record<MissionSection, MissionInstance[]>;
  pinnedMission: Record<MissionSection, string | null>;
  tutorial: { step: number; done: boolean; finaleGranted: boolean };
  streak: StreakState;
  arena: ArenaState;
  settings: {
    darkMode: boolean;
    panelsMinimized: { mine: boolean; tree: boolean; arena: boolean };
  };
  lastSaved: number;
  createdAt: number;
}

export type SkillBranch = "trunk" | "left" | "right" | "crown";

export type NodeEffect =
  | { kind: "stat"; stat: "critChance" | "critMult" | "orePerHit" | "flatAttack" | "flatDefense"; add: number }
  | { kind: "stat"; stat: "attackSpeedMult" | "mineSpeedMult" | "arenaSpeedMult" | "oreMult" | "attackDamageMult" | "defenseMult" | "xpMult" | "goldMult"; mult: number }
  | { kind: "slot"; panel: Panel }
  | { kind: "oreUnlock"; ore: OreId }
  | { kind: "offline"; rate: number }
  | { kind: "buffDuration"; seconds: number };

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
  minLevel: number;
  branch: SkillBranch;
  x: number;
  y: number;
  effect: NodeEffect;
}

export interface DerivedStats {
  critChance: number;
  critMult: number;
  orePerHit: number;
  oreMult: number;
  attackDamageMult: number;
  flatAttack: number;
  attackSpeedMult: number;
  mineSpeedMult: number;
  arenaSpeedMult: number;
  defenseMult: number;
  flatDefense: number;
  xpMult: number;
  goldMult: number;
  mineSlots: number;
  arenaSlots: number;
  offlineRate: number;
  buffDurationSec: number;
  unlockedOres: OreId[];
}
