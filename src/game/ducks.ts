import { DUCK_LEVEL_STAT_BONUS } from "./balance";
import type { DuckDef, GameState, OwnedDuck } from "./types";

// All 13 v1 ducks, rescaled for the v2 economy (PLAN2.md §3: mining power
// ~1/10 of v1, attack damage ~1/2). Stats are level-1 values. The full ~160
// duck roster arrives via duckgen.ts in phase V2-4.
export const DUCK_DEFS: readonly DuckDef[] = [
  { id: "bill", name: "Bill", rarity: "common", role: "miner", miningPower: 0.1, attackDamage: 0.5, attacksPerSecond: 1.0, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "pebbles", name: "Pebbles", rarity: "common", role: "miner", miningPower: 0.08, attackDamage: 0.5, attacksPerSecond: 1.3, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "quackers", name: "Quackers", rarity: "common", role: "fighter", miningPower: 0.02, attackDamage: 1.5, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "waddles", name: "Waddles", rarity: "common", role: "fighter", miningPower: 0.02, attackDamage: 1, attacksPerSecond: 0.8, hp: 45, defense: 3, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "goldie", name: "Goldie", rarity: "uncommon", role: "miner", miningPower: 0.15, attackDamage: 0.5, attacksPerSecond: 1.0, hp: 25, defense: 0, critChanceBonus: 0.05, critDamageBonus: 0 },
  { id: "drake", name: "Drake", rarity: "uncommon", role: "fighter", miningPower: 0.03, attackDamage: 2.5, attacksPerSecond: 1.0, hp: 35, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0 },
  { id: "puddle", name: "Puddle", rarity: "uncommon", role: "hybrid", miningPower: 0.12, attackDamage: 2, attacksPerSecond: 0.9, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "sirquack", name: "Sir Quacksalot", rarity: "rare", role: "fighter", miningPower: 0.04, attackDamage: 4, attacksPerSecond: 1.0, hp: 60, defense: 4, critChanceBonus: 0, critDamageBonus: 0.25 },
  { id: "nugget", name: "Nugget", rarity: "rare", role: "miner", miningPower: 0.3, attackDamage: 1, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0.1, critDamageBonus: 0 },
  { id: "drillbert", name: "Drillbert", rarity: "epic", role: "miner", miningPower: 0.5, attackDamage: 1.5, attacksPerSecond: 1.5, hp: 40, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0, passive: "teamOre10" },
  { id: "thunder", name: "Thunderquack", rarity: "epic", role: "fighter", miningPower: 0.05, attackDamage: 7, attacksPerSecond: 1.4, hp: 70, defense: 4, critChanceBonus: 0.1, critDamageBonus: 0, passive: "teamDmg10" },
  { id: "goose", name: "The Golden Goose", rarity: "legendary", role: "miner", miningPower: 1.0, attackDamage: 2.5, attacksPerSecond: 1.2, hp: 50, defense: 2, critChanceBonus: 0.15, critDamageBonus: 0, passive: "goldenCrit" },
  { id: "deathbill", name: "Deathbill", rarity: "legendary", role: "fighter", miningPower: 0.1, attackDamage: 12.5, attacksPerSecond: 1.2, hp: 90, defense: 6, critChanceBonus: 0.15, critDamageBonus: 0.5, passive: "streakShield" },
];

const byId = new Map(DUCK_DEFS.map((d) => [d.id, d]));

export function getDuckDef(defId: string): DuckDef {
  const def = byId.get(defId);
  if (!def) throw new Error(`Unknown duck: ${defId}`);
  return def;
}

// Level L multiplies miningPower, attackDamage, and hp.
export function levelStatMult(level: number): number {
  return 1 + DUCK_LEVEL_STAT_BONUS * (level - 1);
}

export function miningPowerOf(duck: OwnedDuck): number {
  return getDuckDef(duck.defId).miningPower * levelStatMult(duck.level);
}

export function attackDamageOf(duck: OwnedDuck): number {
  return getDuckDef(duck.defId).attackDamage * levelStatMult(duck.level);
}

export function hpOf(duck: OwnedDuck): number {
  return getDuckDef(duck.defId).hp * levelStatMult(duck.level);
}

export function makeOwnedDuck(defId: string): OwnedDuck {
  const def = getDuckDef(defId);
  return { defId, level: 1, shards: 0, nextHitIn: 1 / def.attacksPerSecond };
}

// A locked duck is absent from gacha pools until its lockedBy source (a
// mission, achievement, leaf drop, or shard-shop purchase) grants it.
export function isDuckUnlocked(state: GameState, defId: string): boolean {
  const def = getDuckDef(defId);
  return !def.lockedBy || state.unlockedDucks.includes(defId);
}
