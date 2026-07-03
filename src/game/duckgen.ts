import { POND_AURA } from "./balance";
import { mulberry32 } from "./rng";
import type { DuckDef, PassiveId, Rarity, TraitId } from "./types";

// Fixed seed — the generated roster must be identical on every load so duck
// ids stay stable across saves. Never derive this from Date.now() or
// anything else that changes between runs.
const SEED = 0xc0ffee42;

const ROLES = ["miner", "fighter", "hybrid", "pond"] as const;
type Role = (typeof ROLES)[number];

// Role weights ~30% miner / 30% fighter / 20% hybrid / 20% pond
// (PLAN2.md §4 Phase B).
const ROLE_WEIGHTS: readonly [Role, number][] = [
  ["miner", 0.3],
  ["fighter", 0.3],
  ["hybrid", 0.2],
  ["pond", 0.2],
];

function pickRole(rng: { next(): number }): Role {
  const roll = rng.next();
  let acc = 0;
  for (const [role, weight] of ROLE_WEIGHTS) {
    acc += weight;
    if (roll < acc) return role;
  }
  return ROLE_WEIGHTS[ROLE_WEIGHTS.length - 1][0];
}

// Role-appropriate trait pools (PLAN2.md §4 Phase B): combat traits never
// appear on miners/pond ducks; mining traits never appear on fighters/pond
// ducks. Hybrid gets the union of miner+fighter pools.
const MINER_TRAITS: TraitId[] = ["efficient", "greedy", "intelligent", "lucky", "loyal"];
const FIGHTER_TRAITS: TraitId[] = ["brave", "cowardly", "energetic", "stoic", "lucky", "loyal"];
const POND_TRAITS: TraitId[] = ["lazy", "intelligent", "lucky", "loyal", "curious"];
const HYBRID_TRAITS: TraitId[] = [...new Set([...MINER_TRAITS, ...FIGHTER_TRAITS])];

const TRAIT_POOL_BY_ROLE: Record<Role, TraitId[]> = {
  miner: MINER_TRAITS,
  fighter: FIGHTER_TRAITS,
  hybrid: HYBRID_TRAITS,
  pond: POND_TRAITS,
};

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

const ROLE_BASE: Record<Role, { miningPower: number; attackDamage: number; hp: number; defense: number }> = {
  miner: { miningPower: 0.09, attackDamage: 0.6, hp: 22, defense: 0.5 },
  fighter: { miningPower: 0.03, attackDamage: 1.2, hp: 32, defense: 1.5 },
  hybrid: { miningPower: 0.07, attackDamage: 0.9, hp: 27, defense: 1 },
  // Pond ducks are poor workers/fighters — their value is the aura + passive
  // power from HP (PLAN2.md §4 Phase B).
  pond: { miningPower: 0.02, attackDamage: 0.5, hp: 30, defense: 0.8 },
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

// Same string-hash-seeded-mulberry32 trick duckArt.ts uses to derive art rig
// params from a defId: a per-duck secondary RNG, seeded from the duck's own
// name/id, drives every draw that must NOT disturb the shared `rng` sequence
// that produces ids/names/rarities (PLAN2.md §4 Phase B — CRITICAL for save
// compatibility, since saves reference duck ids).
function hashString(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Builds one duck's full stat block for the given rarity, using the shared
// role-base + rarity-budget formula. `name` may be procedurally generated
// or a hand-curated legendary+ name — the math is identical either way.
//
// `rng` is the single shared generator that also produces every duck's name
// (drawn by the caller before this runs) — its draw COUNT AND ORDER here
// must stay exactly as it was pre-Phase-B, or every duck after the first
// change would get a different name/id/rarity than existing saves reference.
// `duckRng` is a second, per-duck RNG (seeded from a hash of the duck's own
// slugified name/id — the same trick duckArt.ts uses for art rig params) and
// is where the NEW role/trait/pondAura draws live, so they can freely change
// without touching `rng`'s sequence at all.
function buildDuck(
  rng: { next(): number },
  duckRng: { next(): number },
  rarity: Rarity,
  name: string,
  opts: { passive?: PassiveId; forcedTrait?: TraitId; forcedRole?: Role } = {},
): DuckDef {
  // Same shared-rng draw the original code made here (role pick), but its
  // result is discarded — role now comes from duckRng — so the sequence
  // position for every draw after it (jitter, trait, crit, etc.) is
  // unchanged from before.
  rng.next();
  const role = opts.forcedRole ?? pickRole(duckRng);
  const budget = RARITY_BUDGET[rarity];
  const jitter = () => 0.85 + rng.next() * 0.3; // ±15%
  const base = ROLE_BASE[role];

  const traitPool = TRAIT_POOL_BY_ROLE[role];
  // Same shared-rng draw as the original trait pick, kept for sequence
  // parity (skipped when the caller forces a trait, exactly as before) —
  // its result is discarded; the real trait pick comes from duckRng so it
  // respects the new role-matched pools.
  if (opts.forcedTrait === undefined) rng.next();
  const trait = opts.forcedTrait ?? pick(duckRng, traitPool);
  const critChanceBonus = Math.round((RARITY_CRIT_CHANCE[rarity] * jitter()) * 1000) / 1000;
  const critDamageBonus = rng.next() < 0.15 ? Math.round(rng.next() * 0.3 * 100) / 100 : 0;

  const pondAura =
    role === "pond"
      ? { kind: (duckRng.next() < 0.5 ? "combat" : "economy") as "combat" | "economy", power: POND_AURA.byRarity[rarity] }
      : undefined;

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
    ...(pondAura ? { pondAura } : {}),
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

// Radiant is legendary+ only but any role — legendary/mythic/divine ducks
// draw their trait from their role's normal pool + radiant, same as before.
function forcedTraitPoolFor(role: Role): TraitId[] {
  return [...TRAIT_POOL_BY_ROLE[role], "radiant"];
}

function buildRoster(): DuckDef[] {
  const rng = mulberry32(SEED);
  const usedNames = new Set<string>();
  const ducks: DuckDef[] = [];

  for (const rarity of ["common", "uncommon", "rare", "epic"] as const) {
    for (let i = 0; i < GENERATED_COUNTS[rarity]; i++) {
      const name = generateName(rng, usedNames);
      // Per-duck secondary RNG (id-hash-seeded) drives role/trait/aura
      // draws so they never disturb the shared `rng`'s name-generation
      // sequence — ids/names/rarities stay byte-identical across changes.
      const duckRng = mulberry32(hashString(slugify(name)));
      ducks.push(buildDuck(rng, duckRng, rarity, name));
    }
  }
  for (const name of LEGENDARY_NAMES) {
    const duckRng = mulberry32(hashString(slugify(name)));
    const role = pickRole(duckRng);
    // Same shared-rng draw the original code made here (forced-trait pick
    // for legendary+), kept for sequence parity; its result is discarded.
    rng.next();
    ducks.push(buildDuck(rng, duckRng, "legendary", name, { forcedRole: role, forcedTrait: pick(duckRng, forcedTraitPoolFor(role)) }));
  }
  for (const name of MYTHIC_NAMES) {
    const duckRng = mulberry32(hashString(slugify(name)));
    const role = pickRole(duckRng);
    rng.next();
    ducks.push(buildDuck(rng, duckRng, "mythic", name, { forcedRole: role, forcedTrait: pick(duckRng, forcedTraitPoolFor(role)) }));
  }
  for (const name of DIVINE_NAMES) {
    const duckRng = mulberry32(hashString(slugify(name)));
    const role = pickRole(duckRng);
    ducks.push(buildDuck(rng, duckRng, "divine", name, { forcedRole: role, forcedTrait: "radiant" }));
  }

  return ducks;
}

// Built once at module load from the fixed seed — deterministic every run.
export const GENERATED_DUCKS: readonly DuckDef[] = buildRoster();
