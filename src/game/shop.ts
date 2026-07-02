import { DUCK_MAX_LEVEL, GACHA } from "./balance";
import { DUCK_DEFS, getDuckDef, makeOwnedDuck } from "./ducks";
import { emit } from "./events";
import type { GameState, Rarity, Rng } from "./types";

export type PackType = "standard" | "five";

export interface GachaResult {
  defId: string;
  rarity: Rarity;
  isNew: boolean;
  shardsGained: number; // 0 when new
}

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

// While QUACKENING (T100) is active, all shop purchases are free.
export function packPrice(pack: PackType, state: GameState, nowMs: number): number {
  if (nowMs < state.streak.buffExpiry.t100) return 0;
  return pack === "standard" ? GACHA.standardPackCost : GACHA.fivePackCost;
}

// Pick a rarity band from cumulative odds (common first).
export function rollRarity(rng: Rng): Rarity {
  const roll = rng.next();
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += GACHA.odds[rarity];
    if (roll < cumulative) return rarity;
  }
  return "legendary";
}

function rollDuckOfRarity(rng: Rng, rarity: Rarity): string {
  const pool = DUCK_DEFS.filter((d) => d.rarity === rarity);
  const index = Math.min(Math.floor(rng.next() * pool.length), pool.length - 1);
  return pool[index].id;
}

function grantDuck(state: GameState, defId: string): GachaResult {
  const rarity = getDuckDef(defId).rarity;
  const owned = state.ducks.find((d) => d.defId === defId);
  if (owned) {
    const shards = GACHA.dupeShards[rarity];
    owned.shards += shards;
    return { defId, rarity, isNew: false, shardsGained: shards };
  }
  state.ducks.push(makeOwnedDuck(defId));
  return { defId, rarity, isNew: true, shardsGained: 0 };
}

// Deducts the price and resolves every roll. Returns null if unaffordable.
// The five-pack guarantees uncommon-or-better: if the first four rolls all
// come up common, the last roll's band is bumped to uncommon.
export function openPack(
  state: GameState,
  rng: Rng,
  pack: PackType,
  nowMs: number,
): GachaResult[] | null {
  const price = packPrice(pack, state, nowMs);
  if (state.gold < price) return null;
  state.gold -= price;
  state.lifetime.packs += 1;

  const rolls = pack === "standard" ? 1 : GACHA.fivePackRolls;
  const results: GachaResult[] = [];
  let sawUncommonPlus = false;

  for (let i = 0; i < rolls; i++) {
    let rarity = rollRarity(rng);
    const isLastRoll = i === rolls - 1;
    if (pack === "five" && isLastRoll && !sawUncommonPlus && rarity === "common") {
      rarity = "uncommon";
    }
    if (rarity !== "common") sawUncommonPlus = true;
    results.push(grantDuck(state, rollDuckOfRarity(rng, rarity)));
  }

  emit("gacha", { results });
  return results;
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
