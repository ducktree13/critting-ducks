import { SHARD_SHOP } from "./balance";
import { DUCK_DEFS, isDuckUnlocked } from "./ducks";
import { grantDuck, type GachaResult } from "./packs";
import { mulberry32 } from "./rng";
import type { GameState } from "./types";

export interface ShardShopSlot {
  defId: string;
  price: number;
}

function periodIndex(nowMs: number): number {
  return Math.floor(nowMs / SHARD_SHOP.restockPeriodMs);
}

// Real-time ms until the next restock, for a countdown display.
export function msUntilRestock(nowMs: number): number {
  const period = SHARD_SHOP.restockPeriodMs;
  return period - (nowMs % period);
}

// Deterministic per-restock-period seed mixed with the save's creation
// time, so every save sees its own (but stable, no-server) rotation.
function shopSeed(state: GameState, nowMs: number): number {
  return (periodIndex(nowMs) ^ Math.imul(state.createdAt | 0, 2654435761)) >>> 0;
}

// Four ducks, deterministic for the current 12h period. Divine ducks only
// appear once the player has reached the required level.
export function currentShardShopSlots(state: GameState, nowMs: number): ShardShopSlot[] {
  const pool = DUCK_DEFS.filter(
    (d) =>
      isDuckUnlocked(state, d.id) &&
      (d.rarity !== "divine" || state.level >= SHARD_SHOP.divineMinLevel),
  );
  const rng = mulberry32(shopSeed(state, nowMs));
  const picked: ShardShopSlot[] = [];
  const usedIds = new Set<string>();

  while (picked.length < SHARD_SHOP.slots && picked.length < pool.length) {
    const def = pool[Math.floor(rng.next() * pool.length)];
    if (usedIds.has(def.id)) continue;
    usedIds.add(def.id);
    picked.push({ defId: def.id, price: SHARD_SHOP.spPrice[def.rarity] });
  }
  return picked;
}

// Buys one duck from the current rotation with Shard Points. Grants it the
// same way a pack roll would (dupe -> shards, overflow -> more SP).
export function buyFromShardShop(
  state: GameState,
  defId: string,
  nowMs: number,
): GachaResult | null {
  const slot = currentShardShopSlots(state, nowMs).find((s) => s.defId === defId);
  if (!slot || state.shardPoints < slot.price) return null;
  state.shardPoints -= slot.price;
  return grantDuck(state, defId);
}
