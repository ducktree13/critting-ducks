export type OreId = "copper" | "silver" | "crystal" | "starmetal";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type Panel = "mine" | "arena";
export type PassiveId = "teamOre10" | "teamDmg10" | "goldenCrit" | "streakShield";

export interface Rng {
  next(): number; // [0, 1)
}

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
}

export interface OwnedDuck {
  defId: string;
  level: number;
  shards: number;
  nextHitIn: number;
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
  version: 1;
  gold: number;
  xp: number;
  level: number;
  lifetime: { gold: number; crits: number; hits: number; packs: number };
  ores: Record<OreId, number>;
  selectedOre: OreId;
  ducks: OwnedDuck[];
  rosters: { mine: string[]; arena: string[] };
  skillNodes: string[];
  streak: StreakState;
  arena: ArenaState;
  settings: { darkMode: boolean };
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
