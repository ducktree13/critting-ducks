export type OreId = "copper" | "silver" | "crystal" | "starmetal" | "voidstone" | "aurorium";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic" | "divine";
export type Panel = "mine" | "arena" | "pond";
export type PackId = "standard" | "five" | "pack25" | "pack100";
export type PassiveId = "teamOre10" | "teamDmg10" | "goldenCrit" | "streakShield";

export interface Rng {
  next(): number; // [0, 1)
}

export type LockKind = "mission" | "achievement" | "leaf" | "shop";
export type TraitId =
  | "brave"
  | "cowardly"
  | "intelligent"
  | "efficient"
  | "greedy"
  | "lazy"
  | "lucky"
  | "loyal"
  | "energetic"
  | "stoic"
  | "curious"
  | "radiant";

export interface DuckDef {
  id: string;
  name: string;
  rarity: Rarity;
  role: "miner" | "fighter" | "hybrid" | "pond";
  trait: TraitId;
  miningPower: number;
  attackDamage: number;
  attacksPerSecond: number;
  hp: number;
  defense: number;
  critChanceBonus: number;
  critDamageBonus: number;
  passive?: PassiveId;
  // Global aura applied while this duck sits in the pond roster (PLAN2.md
  // §4 Phase B): combat boosts team attack/defense, economy boosts gold/xp.
  // Power scales with rarity, see balance.ts POND_AURA.
  pondAura?: { kind: "combat" | "economy"; power: number };
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
  ascension?: number; // 0–3; prestige tier, resets level to 1 but boosts base stats
}

export type MaterialId = "slimeGoo" | "gooseFeather" | "golemCrumb" | "sharkTooth" | "pondlordRelic";
export type EquipSlot = "weapon" | "armor" | "charm";

export type ExpeditionDuration = "short" | "long" | "epic"; // 1h / 8h / 24h

export interface ExpeditionInstance {
  id: string;
  duration: ExpeditionDuration;
  ducks: string[]; // defIds sent, unavailable to other rosters while away
  startedAt: number; // real-time ms epoch
  endsAt: number; // real-time ms epoch
  readyNotified?: boolean; // "expeditionReady" event fired once, while the game is open
}

// Every field is an own-duck bonus, applied the same way trait effects are —
// weapon touches attack, armor touches defense/hp, charm touches crit/gold.
export interface EquipmentStats {
  flatAttack?: number;
  attackMult?: number;
  flatDefense?: number;
  hpMult?: number;
  critChanceBonus?: number;
  goldMult?: number;
}

export interface EquipmentItem {
  id: string; // unique instance id
  kindId: string; // which named equipment "kind" (art/name lookup)
  slot: EquipSlot;
  rarity: Rarity;
  name: string;
  stats: EquipmentStats;
  equippedBy: string | null; // duck defId, or null while in inventory
}

export interface StreakState {
  current: number;
  best: number;
  buffExpiry: { t10: number; t25: number; t50: number; t100: number };
  shieldReadyAt: number;
}

export interface ArenaEnemy {
  id: string; // enemy TYPE id (ENEMY_TYPES / BOSS_ENEMY)
  hp: number;
  maxHp: number;
  nextHitIn: number;
}

export interface ArenaState {
  wave: number;
  enemies: ArenaEnemy[];
  teamHp: number;
  teamMaxHp: number;
  retryAt: number;
  defeated: string[]; // enemy TYPE ids ever killed (for first-defeat bonus)
}

export interface GameState {
  version: 2;
  gold: number;
  xp: number;
  level: number;
  lifetime: {
    gold: number;
    crits: number;
    hits: number;
    packs: number;
    leavesClicked: number;
    expeditionsCompleted: number;
    gearCrafted: number;
    bossesDefeated: number;
    divinePulls: number;
  };
  ores: Record<OreId, number>;
  selectedOre: OreId;
  ducks: OwnedDuck[];
  rosters: { mine: string[]; arena: string[]; pond: string[] };
  skillNodes: string[];
  shardPoints: number;                       // overflow shards, spent in the shard shop
  packCredits: Record<PackId, number>;       // free packs from level rewards etc.
  unlockedDucks: string[];                   // defIds of lockedBy ducks the player has freed
  materials: Record<MaterialId, number>;
  equipment: EquipmentItem[];
  achievementsCompleted: string[];
  missions: Record<MissionSection, MissionInstance[]>;
  pinnedMission: Record<MissionSection, string | null>;
  tutorial: { step: number; done: boolean; finaleGranted: boolean };
  streak: StreakState;
  arena: ArenaState;
  chapter: 1 | 2;
  leaves: LeafDrop[];
  nextLeafAt: number; // real-time ms epoch
  expeditions: ExpeditionInstance[];
  settings: {
    darkMode: boolean;
    panelsMinimized: { mine: boolean; tree: boolean; arena: boolean };
    act2Tree: Act2TreeId;
  };
  lastSaved: number;
  createdAt: number;
}

export type SkillBranch = "trunk" | "left" | "right" | "crown";
// Act 1 is the original single tree; Act 2 unlocks four more once Act 1 is
// fully owned (PLAN2.md §9).
export type Act2TreeId = "mining2" | "combat2" | "crit2" | "passive2";
export type TreeId = "act1" | Act2TreeId;

export type NodeEffect =
  | { kind: "stat"; stat: "critChance" | "critMult" | "orePerHit" | "flatAttack" | "flatDefense"; add: number }
  | { kind: "stat"; stat: "attackSpeedMult" | "mineSpeedMult" | "arenaSpeedMult" | "oreMult" | "attackDamageMult" | "defenseMult" | "xpMult" | "goldMult"; mult: number }
  | { kind: "slot"; panel: Panel }
  | { kind: "oreUnlock"; ore: OreId }
  | { kind: "offline"; rate: number }
  | { kind: "buffDuration"; seconds: number }
  | { kind: "packCrit"; add: number };

export interface SkillNode {
  id: string;
  name: string;
  desc: string;
  cost: number;
  requires?: string;
  minLevel: number;
  branch: SkillBranch;
  treeId: TreeId;
  x: number;
  y: number;
  effect: NodeEffect;
}

export interface LeafDrop {
  id: string;
  spawnedAt: number;
  expiresAt: number;
  kind: "gold" | "xp" | "duck";
  amount: number; // gold/xp amount; ignored for "duck"
  isCrit: boolean;
}

export interface DerivedStats {
  critChance: number;
  critMult: number;
  packCritChance: number;
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
  pondSlots: number;
  offlineRate: number;
  buffDurationSec: number;
  unlockedOres: OreId[];
}
