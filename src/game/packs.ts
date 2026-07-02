import { DUCK_MAX_LEVEL, GACHA, RARITY_ORDER, SHARD_CAP } from "./balance";
import { DUCK_DEFS, getDuckDef, isDuckUnlocked, makeOwnedDuck } from "./ducks";
import { emit } from "./events";
import { getStats } from "./state";
import type { GameState, PackId, Rarity, Rng } from "./types";

export interface GachaResult {
  defId: string;
  rarity: Rarity;
  isNew: boolean;
  shardsGained: number; // 0 when new (overflow past the cap becomes Shard Points)
}

export interface PackOpenResult {
  results: GachaResult[]; // all rolls including bonus packs, in order
  bonusPacks: number; // packs granted free by pack crits (0–3)
}

export function rarityAtLeast(rarity: Rarity, floor: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(floor);
}

// Level gate (e.g. the 100-Pack unlocks at player level 20).
export function packUnlocked(pack: PackId, state: GameState): boolean {
  return state.level >= GACHA.packs[pack].minLevel;
}

// Free during QUACKENING (T100) or when a pack credit is banked.
export function packPrice(pack: PackId, state: GameState, nowMs: number): number {
  if (state.packCredits[pack] > 0) return 0;
  if (nowMs < state.streak.buffExpiry.t100) return 0;
  return GACHA.packs[pack].price;
}

// Pick a rarity band from cumulative odds (common first).
export function rollRarity(rng: Rng): Rarity {
  const roll = rng.next();
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += GACHA.odds[rarity];
    if (roll < cumulative) return rarity;
  }
  return "divine";
}

// Picks uniformly within the rarity, excluding locked ducks (lockedBy).
// If that pool is empty (all locked, or no ducks of that rarity exist yet),
// steps down the ladder to the nearest populated, unlocked tier.
function rollDuckOfRarity(state: GameState, rng: Rng, rarity: Rarity): string {
  let tier = RARITY_ORDER.indexOf(rarity);
  let pool: typeof DUCK_DEFS = [];
  while (tier >= 0) {
    pool = DUCK_DEFS.filter(
      (d) => d.rarity === RARITY_ORDER[tier] && isDuckUnlocked(state, d.id),
    );
    if (pool.length > 0) break;
    tier -= 1;
  }
  const index = Math.min(Math.floor(rng.next() * pool.length), pool.length - 1);
  return pool[index].id;
}

function grantDuck(state: GameState, defId: string): GachaResult {
  const rarity = getDuckDef(defId).rarity;
  const owned = state.ducks.find((d) => d.defId === defId);
  if (owned) {
    const gained = GACHA.dupeShards[rarity];
    const room = Math.max(SHARD_CAP - owned.shards, 0);
    const kept = Math.min(gained, room);
    owned.shards += kept;
    state.shardPoints += gained - kept; // overflow becomes Shard Points
    return { defId, rarity, isNew: false, shardsGained: gained };
  }
  state.ducks.push(makeOwnedDuck(defId));
  return { defId, rarity, isNew: true, shardsGained: 0 };
}

// One pack's rolls, honoring its rarity-floor guarantee: if no natural roll
// met the bar, the final roll's band is bumped to the guaranteed tier.
function rollOnePack(state: GameState, rng: Rng, pack: PackId): GachaResult[] {
  const { rolls, guarantee } = GACHA.packs[pack];
  const results: GachaResult[] = [];
  let guaranteeMet = guarantee === null;

  for (let i = 0; i < rolls; i++) {
    let rarity = rollRarity(rng);
    const isLastRoll = i === rolls - 1;
    if (guarantee && isLastRoll && !guaranteeMet && !rarityAtLeast(rarity, guarantee)) {
      rarity = guarantee;
    }
    if (guarantee && rarityAtLeast(rarity, guarantee)) guaranteeMet = true;
    results.push(grantDuck(state, rollDuckOfRarity(state, rng, rarity)));
  }
  return results;
}

// Buys and opens a pack. Every pack opened rolls the player's crit chance;
// a crit grants a free bonus pack of the same type (chains, max 3 bonus).
// Consumes a pack credit before charging gold. Returns null if locked or
// unaffordable.
export function openPack(
  state: GameState,
  rng: Rng,
  pack: PackId,
  nowMs: number,
): PackOpenResult | null {
  if (!packUnlocked(pack, state)) return null;

  const price = packPrice(pack, state, nowMs);
  if (state.gold < price) return null;
  if (state.packCredits[pack] > 0) state.packCredits[pack] -= 1;
  else state.gold -= price;

  const critChance = getStats(state).critChance;
  const results: GachaResult[] = [];
  let bonusPacks = 0;

  let packsToOpen = 1;
  while (packsToOpen > 0) {
    packsToOpen -= 1;
    state.lifetime.packs += 1;
    results.push(...rollOnePack(state, rng, pack));
    if (bonusPacks < GACHA.packCritMaxBonus && rng.next() < critChance) {
      bonusPacks += 1;
      packsToOpen += 1;
    }
  }

  emit("gacha", { results });
  return { results, bonusPacks };
}

export function upgradeCost(duck: { level: number }): number {
  return duck.level; // level N -> N+1 costs N shards
}

export function canUpgrade(state: GameState, defId: string): boolean {
  const duck = state.ducks.find((d) => d.defId === defId);
  return !!duck && duck.level < DUCK_MAX_LEVEL && duck.shards >= upgradeCost(duck);
}

export function upgradeDuck(state: GameState, defId: string): boolean {
  if (!canUpgrade(state, defId)) return false;
  const duck = state.ducks.find((d) => d.defId === defId)!;
  duck.shards -= upgradeCost(duck);
  duck.level += 1;
  emit("roster", {});
  return true;
}
