import { mulberry32 } from "./rng";
import type { DuckDef, PassiveId, Rarity, TraitId } from "./types";

// Fixed seed — the generated roster must be identical on every load so duck
// ids stay stable across saves. Never derive this from Date.now() or
// anything else that changes between runs.
const SEED = 0xc0ffee42;

const ROLES = ["miner", "fighter", "hybrid"] as const;

// Traits available to procedurally generated ducks; radiant is reserved for
// hand-curated legendary+ ducks per PLAN2.md §4.
const GENERATABLE_TRAITS: TraitId[] = [
  "brave", "cowardly", "intelligent", "efficient", "greedy",
  "lazy", "lucky", "loyal", "energetic", "stoic", "curious",
];

const RARITY_BUDGET: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.6,
  rare: 3,
  epic: 6,
  legendary: 11,
  mythic: 20,
  divine: 35,
};

const RARITY_CRIT_CHANCE: Record<Rarity, number> = {
  common: 0,
  uncommon: 0.03,
  rare: 0.06,
  epic: 0.08,
  legendary: 0.12,
  mythic: 0.15,
  divine: 0.18,
};

const ROLE_BASE: Record<(typeof ROLES)[number], { miningPower: number; attackDamage: number; hp: number; defense: number }> = {
  miner: { miningPower: 0.09, attackDamage: 0.6, hp: 22, defense: 0.5 },
  fighter: { miningPower: 0.03, attackDamage: 1.2, hp: 32, defense: 1.5 },
  hybrid: { miningPower: 0.07, attackDamage: 0.9, hp: 27, defense: 1 },
};

const NAME_PREFIXES = [
  "Marsh", "Puddle", "Splash", "Ripple", "Reed", "Bubble", "Fluff", "Quill",
  "Brook", "Drizzle", "Misty", "Nibble", "Waddle", "Pond", "Feather", "Downy",
  "Sunny", "Dapper", "Squish", "Wobble", "Glimmer", "Cattail", "Silt", "Mudpie",
  "Snap", "Honk", "Frost", "Twig", "Berry", "Clover",
];

const NAME_SUFFIXES = [
  "duck", "quack", "bill", "wing", "paddle", "down", "beak", "tail",
  "waddler", "dabbler", "drifter", "skimmer",
];

function pick<T>(rng: { next(): number }, arr: readonly T[]): T {
  return arr[Math.min(Math.floor(rng.next() * arr.length), arr.length - 1)];
}

function generateName(rng: { next(): number }, used: Set<string>): string {
  let name: string;
  do {
    const prefix = pick(rng, NAME_PREFIXES);
    const suffix = pick(rng, NAME_SUFFIXES);
    name = prefix + suffix.charAt(0).toUpperCase() + suffix.slice(1);
  } while (used.has(name));
  used.add(name);
  return name;
}

function slugify(name: string): string {
  return "d_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Builds one duck's full stat block for the given rarity, using the shared
// role-base + rarity-budget formula. `name` may be procedurally generated
// or a hand-curated legendary+ name — the math is identical either way.
function buildDuck(
  rng: { next(): number },
  rarity: Rarity,
  name: string,
  opts: { passive?: PassiveId; forcedTrait?: TraitId } = {},
): DuckDef {
  const role = pick(rng, ROLES);
  const budget = RARITY_BUDGET[rarity];
  const jitter = () => 0.85 + rng.next() * 0.3; // ±15%
  const base = ROLE_BASE[role];

  const trait = opts.forcedTrait ?? pick(rng, GENERATABLE_TRAITS);
  const critChanceBonus = Math.round((RARITY_CRIT_CHANCE[rarity] * jitter()) * 1000) / 1000;
  const critDamageBonus = rng.next() < 0.15 ? Math.round(rng.next() * 0.3 * 100) / 100 : 0;

  return {
    id: slugify(name),
    name,
    rarity,
    role,
    trait,
    miningPower: Math.round(base.miningPower * budget * jitter() * 100) / 100,
    attackDamage: Math.round(base.attackDamage * budget * jitter() * 100) / 100,
    attacksPerSecond: Math.round((0.8 + rng.next() * 0.7) * 100) / 100,
    hp: Math.round(base.hp * budget * jitter()),
    defense: Math.round(base.defense * budget * jitter() * 10) / 10,
    critChanceBonus,
    critDamageBonus,
    ...(opts.passive ? { passive: opts.passive } : {}),
  };
}

// Hand-curated legendary+ names (PLAN2.md §4: "Legendary+ ducks are
// hand-curated"). "Duck Tree" is reserved for the leaf-click exclusive
// added in V2-7 and deliberately excluded here.
const LEGENDARY_NAMES = [
  "Sir Reginald Quack III", "The Feathered Fury", "Empress Marigold",
  "Captain Splash", "The Iron Drake", "Lady Moonwing", "Bogthorn the Relentless",
  "The Sapphire Loon", "Grandmaster Ripple", "The Obsidian Mallard",
  "Whistling Willow", "The Crimson Teal", "Duchess Featherstone",
];
const MYTHIC_NAMES = [
  "Voidquacker", "The Eternal Drifter", "Starfeather", "The Hollow King",
  "Aurelia the Undying", "The Thousand-Wing", "Nightbill Prime",
  "The Wandering Storm", "Chronoduck", "The Last Migration",
];
const DIVINE_NAMES = [
  "Quackenstein, First of Feathers", "The Celestial Mallard",
  "Aetherwing, Duck of Dawn", "The Unfeathered One", "The Radiant Progenitor",
];

// Target roster: 40/35/30/25/15/10/5 = 160 total, minus the 13 hand-written
// v1 ducks already covering some of each tier.
const GENERATED_COUNTS: Record<Rarity, number> = {
  common: 36,
  uncommon: 32,
  rare: 28,
  epic: 23,
  legendary: 0, // hand-curated below instead of counted
  mythic: 0,
  divine: 0,
};

function buildRoster(): DuckDef[] {
  const rng = mulberry32(SEED);
  const usedNames = new Set<string>();
  const ducks: DuckDef[] = [];

  for (const rarity of ["common", "uncommon", "rare", "epic"] as const) {
    for (let i = 0; i < GENERATED_COUNTS[rarity]; i++) {
      ducks.push(buildDuck(rng, rarity, generateName(rng, usedNames)));
    }
  }
  for (const name of LEGENDARY_NAMES) {
    ducks.push(buildDuck(rng, "legendary", name, { forcedTrait: pick(rng, [...GENERATABLE_TRAITS, "radiant"]) }));
  }
  for (const name of MYTHIC_NAMES) {
    ducks.push(buildDuck(rng, "mythic", name, { forcedTrait: pick(rng, [...GENERATABLE_TRAITS, "radiant"]) }));
  }
  for (const name of DIVINE_NAMES) {
    ducks.push(buildDuck(rng, "divine", name, { forcedTrait: "radiant" }));
  }

  return ducks;
}

// Built once at module load from the fixed seed — deterministic every run.
export const GENERATED_DUCKS: readonly DuckDef[] = buildRoster();
