import { ASCENSION, DUCK_LEVEL_STAT_BONUS, EXPEDITION_POWER, POND } from "./balance";
import { GENERATED_DUCKS } from "./duckgen";
import { TRAITS } from "./traits";
import type { DuckDef, GameState, OwnedDuck } from "./types";

// The 13 v1 ducks, rescaled for the v2 economy (PLAN2.md §3: mining power
// ~1/10 of v1, attack damage ~1/2), plus ~147 more from duckgen.ts to reach
// the full 160-duck roster (40/35/30/25/15/10/5 across the seven rarities).
const HAND_CURATED_DUCKS: readonly DuckDef[] = [
  // stoic (defense) is a fighter trait, not miner — Bill/Pebbles swapped to
  // miner-pool traits that fit their personalities (PLAN2.md §4 Phase B).
  { id: "bill", name: "Bill", rarity: "common", role: "miner", trait: "loyal", miningPower: 0.1, attackDamage: 0.5, attacksPerSecond: 1.0, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "pebbles", name: "Pebbles", rarity: "common", role: "miner", trait: "efficient", miningPower: 0.08, attackDamage: 0.5, attacksPerSecond: 1.3, hp: 20, defense: 0, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "quackers", name: "Quackers", rarity: "common", role: "fighter", trait: "brave", miningPower: 0.02, attackDamage: 1.5, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "waddles", name: "Waddles", rarity: "common", role: "fighter", trait: "stoic", miningPower: 0.02, attackDamage: 1, attacksPerSecond: 0.8, hp: 45, defense: 3, critChanceBonus: 0, critDamageBonus: 0 },
  { id: "goldie", name: "Goldie", rarity: "uncommon", role: "miner", trait: "lucky", miningPower: 0.15, attackDamage: 0.5, attacksPerSecond: 1.0, hp: 25, defense: 0, critChanceBonus: 0.05, critDamageBonus: 0 },
  { id: "drake", name: "Drake", rarity: "uncommon", role: "fighter", trait: "energetic", miningPower: 0.03, attackDamage: 2.5, attacksPerSecond: 1.0, hp: 35, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0 },
  // Puddle becomes the hand-curated pond specialist (PLAN2.md §4 Phase B):
  // role pond, economy aura, loyal (already in the pond trait pool).
  { id: "puddle", name: "Puddle", rarity: "uncommon", role: "pond", trait: "loyal", miningPower: 0.12, attackDamage: 2, attacksPerSecond: 0.9, hp: 30, defense: 1, critChanceBonus: 0, critDamageBonus: 0, pondAura: { kind: "economy", power: 0.03 } },
  { id: "sirquack", name: "Sir Quacksalot", rarity: "rare", role: "fighter", trait: "stoic", miningPower: 0.04, attackDamage: 4, attacksPerSecond: 1.0, hp: 60, defense: 4, critChanceBonus: 0, critDamageBonus: 0.25 },
  { id: "nugget", name: "Nugget", rarity: "rare", role: "miner", trait: "greedy", miningPower: 0.3, attackDamage: 1, attacksPerSecond: 1.0, hp: 30, defense: 1, critChanceBonus: 0.1, critDamageBonus: 0 },
  { id: "drillbert", name: "Drillbert", rarity: "epic", role: "miner", trait: "efficient", miningPower: 0.5, attackDamage: 1.5, attacksPerSecond: 1.5, hp: 40, defense: 2, critChanceBonus: 0.05, critDamageBonus: 0, passive: "teamOre10" },
  { id: "thunder", name: "Thunderquack", rarity: "epic", role: "fighter", trait: "brave", miningPower: 0.05, attackDamage: 7, attacksPerSecond: 1.4, hp: 70, defense: 4, critChanceBonus: 0.1, critDamageBonus: 0, passive: "teamDmg10" },
  // stoic (defense) doesn't fit a miner — swapped to greedy, on-theme for a
  // "Golden Goose" and already in the miner trait pool.
  { id: "goose", name: "The Golden Goose", rarity: "legendary", role: "miner", trait: "greedy", miningPower: 1.0, attackDamage: 2.5, attacksPerSecond: 1.2, hp: 50, defense: 2, critChanceBonus: 0.15, critDamageBonus: 0, passive: "goldenCrit" },
  { id: "deathbill", name: "Deathbill", rarity: "legendary", role: "fighter", trait: "energetic", miningPower: 0.1, attackDamage: 12.5, attacksPerSecond: 1.2, hp: 90, defense: 6, critChanceBonus: 0.15, critDamageBonus: 0.5, passive: "streakShield" },
  // Bubble-exclusive (PLAN2.md §9): never drops from packs or the shard shop —
  // only from popping a pond bubble, at a 0.5% chance per bubble.
  // Stays hybrid (so it can also fight/mine) but carries a divine economy
  // pond aura, usable if ever placed in the pond (hybrids may hold an aura;
  // see assignToRoster in state.ts for which roles may enter which roster).
  { id: "duckTree", name: "Duck Tree", rarity: "divine", role: "hybrid", trait: "radiant", miningPower: 3.0, attackDamage: 30, attacksPerSecond: 1.3, hp: 800, defense: 30, critChanceBonus: 0.2, critDamageBonus: 0.3, pondAura: { kind: "economy", power: 0.16 }, lockedBy: { kind: "bubble", id: "duckTree" } },
];

export const DUCK_DEFS: readonly DuckDef[] = [...HAND_CURATED_DUCKS, ...GENERATED_DUCKS];

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

// Each ascension (0–3) permanently boosts base stats; level resets to 1 on
// ascending but this multiplier persists (PLAN2.md §4).
export function ascensionMult(duck: OwnedDuck): number {
  return 1 + ASCENSION.statMultPerAscension * (duck.ascension ?? 0);
}

function traitEffect(def: DuckDef) {
  return TRAITS[def.trait].effect;
}

export function miningPowerOf(duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.miningPower * levelStatMult(duck.level) * ascensionMult(duck) * (traitEffect(def).miningMult ?? 1);
}

// Equipment/crafting are removed for now (playtest X1): gear no longer
// folds into these stats, even for old saves carrying equipped items. The
// `state` param stays (unused) so call sites across the codebase don't need
// to change if/when a future rework reintroduces gear effects here.
export function attackDamageOf(_state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.attackDamage * levelStatMult(duck.level) * ascensionMult(duck) * (traitEffect(def).attackMult ?? 1);
}

export function hpOf(_state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.hp * levelStatMult(duck.level) * ascensionMult(duck) * (traitEffect(def).hpMult ?? 1);
}

// Defense does not scale with level (matches v1) but does scale with ascension.
export function defenseOf(_state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.defense * ascensionMult(duck) * (traitEffect(def).defenseMult ?? 1);
}

export function attackSpeedOf(duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.attacksPerSecond * (traitEffect(def).attackSpeedMult ?? 1);
}

export function critChanceBonusOf(_state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return def.critChanceBonus + (traitEffect(def).critChanceBonus ?? 0);
}

// Multiplies this duck's own XP contribution (trait-only, e.g. Intelligent).
export function xpMultOf(duck: OwnedDuck): number {
  return traitEffect(getDuckDef(duck.defId)).xpMult ?? 1;
}

// Multiplies this duck's own gold contribution (trait-only, e.g. Greedy).
export function goldMultOf(_state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return traitEffect(def).goldMult ?? 1;
}

// Pond contribution (PLAN2.md §10): derived from effective HP rather than a
// new per-duck field, so it scales with rarity/level/ascension for free —
// every duck in the roster is usable, and Lazy ducks excel via their trait.
export function passivePowerOf(state: GameState, duck: OwnedDuck): number {
  const def = getDuckDef(duck.defId);
  return hpOf(state, duck) * POND.passivePowerFromHp * (traitEffect(def).passivePowerMult ?? 1);
}

// Expedition contribution (PLAN2.md §11): folds attack, mining, and a
// slice of hp into one number, so both fighter and miner ducks are worth
// sending — same effective-stat helpers as everywhere else, so ascension
// scales it for free.
export function expeditionPowerOf(state: GameState, duck: OwnedDuck): number {
  return (
    attackDamageOf(state, duck) * EXPEDITION_POWER.attackWeight +
    miningPowerOf(duck) * EXPEDITION_POWER.miningWeight +
    hpOf(state, duck) * EXPEDITION_POWER.hpWeight
  );
}

export function expeditionFailReductionOf(duck: OwnedDuck): number {
  return traitEffect(getDuckDef(duck.defId)).expeditionFailReduction ?? 0;
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
