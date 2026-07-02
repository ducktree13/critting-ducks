import { DUCK_LEVEL_STAT_BONUS } from "./balance";
import type { DuckDef, OwnedDuck } from "./types";

// All 13 ducks (PLAN.md §6). Stats are level-1 values.
export const DUCK_DEFS: readonly DuckDef[] = [
  { id: "bill", name: "Bill", rarity: "common", role: "miner", miningPower: 1.0, attackDamage: 1, attacksPerSecond: 1.0, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "pebbles", name: "Pebbles", rarity: "common", role: "miner", miningPower: 0.8, attackDamage: 1, attacksPerSecond: 1.3, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "quackers", name: "Quackers", rarity: "common", role: "fighter", miningPower: 0.2, attackDamage: 3, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "waddles", name: "Waddles", rarity: "common", role: "fighter", miningPower: 0.2, attackDamage: 2, attacksPerSecond: 0.8, hp: 45, defense: 3, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "goldie", name: "Goldie", rarity: "uncommon", role: "miner", miningPower: 1.5, attackDamage: 1, attacksPerSecond: 1.0, hp: 25, defense: 0, critChanceBonus: 0.05, critDamageBonus: 0 },
  { id: "drake", name: "Drake", rarity: "uncommon", role: "fighter", miningPower: 0.3, attackDamage: 5, attacksPerSecond: 1.0, hp: 35, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0 },
  { id: "puddle", name: "Puddle", rarity: "uncommon", role: "hybrid", miningPower: 1.2, attackDamage: 4, attacksPerSecond: 0.9, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "sirquack", name: "Sir Quacksalot", rarity: "rare", role: "fighter", miningPower: 0.4, attackDamage: 8, attacksPerSecond: 1.0, hp: 60, defense: 4, critChanceBonus: 0, critDamageBonus: 0.25 },
  { id: "nugget", name: "Nugget", rarity: "rare", role: "miner", miningPower: 3.0, attackDamage: 2, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0.1, critDamageBonus: 0 },
  { id: "drillbert", name: "Drillbert", rarity: "epic", role: "miner", miningPower: 5.0, attackDamage: 3, attacksPerSecond: 1.5, hp: 40, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0, passive: "teamOre10" },
  { id: "thunder", name: "Thunderquack", rarity: "epic", role: "fighter", miningPower: 0.5, attackDamage: 14, attacksPerSecond: 1.4, hp: 70, defense: 4, critChanceBonus: 0.1, critDamageBonus: 0, passive: "teamDmg10" },
  { id: "goose", name: "The Golden Goose", rarity: "legendary", role: "miner", miningPower: 10.0, attackDamage: 5, attacksPerSecond: 1.2, hp: 50, defense: 2, critChanceBonus: 0.15, critDamageBonus: 0, passive: "goldenCrit" },
  { id: "deathbill", name: "Deathbill", rarity: "legendary", role: "fighter", miningPower: 1.0, attackDamage: 25, attacksPerSecond: 1.2, hp: 90, defense: 6, critChanceBonus: 0.15, critDamageBonus: 0.5, passive: "streakShield" },
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
