import { beforeEach, describe, expect, it } from "vitest";
import { SHARD_SHOP } from "./balance";
import { getDuckDef } from "./ducks";
import { buyFromShardShop, currentShardShopSlots, msUntilRestock } from "./shardshop";
import { createInitialState } from "./state";
import type { GameState } from "./types";

let state: GameState;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  state = createInitialState();
});

describe("currentShardShopSlots", () => {
  it("offers exactly SHARD_SHOP.slots ducks", () => {
    const slots = currentShardShopSlots(state, NOW);
    expect(slots).toHaveLength(SHARD_SHOP.slots);
  });

  it("prices each slot by its duck's rarity", () => {
    for (const slot of currentShardShopSlots(state, NOW)) {
      expect(slot.price).toBe(SHARD_SHOP.spPrice[getDuckDef(slot.defId).rarity]);
    }
  });

  it("is deterministic within the same 12h period", () => {
    const a = currentShardShopSlots(state, NOW).map((s) => s.defId);
    const b = currentShardShopSlots(state, NOW + 1000).map((s) => s.defId);
    expect(a).toEqual(b);
  });

  it("rotates to a different lineup in the next 12h period", () => {
    const before = currentShardShopSlots(state, NOW).map((s) => s.defId);
    const after = currentShardShopSlots(state, NOW + SHARD_SHOP.restockPeriodMs).map((s) => s.defId);
    expect(after).not.toEqual(before);
  });

  it("excludes divine ducks below the required player level", () => {
    // Sweep many periods; none should ever offer a divine duck pre-level-35.
    for (let i = 0; i < 50; i++) {
      const slots = currentShardShopSlots(state, NOW + i * SHARD_SHOP.restockPeriodMs);
      expect(slots.some((s) => getDuckDef(s.defId).rarity === "divine")).toBe(false);
    }
  });

  it("can offer divine ducks once the player reaches the required level", () => {
    state.level = SHARD_SHOP.divineMinLevel;
    let sawDivine = false;
    for (let i = 0; i < 50; i++) {
      const slots = currentShardShopSlots(state, NOW + i * SHARD_SHOP.restockPeriodMs);
      if (slots.some((s) => getDuckDef(s.defId).rarity === "divine")) sawDivine = true;
    }
    expect(sawDivine).toBe(true);
  });
});

describe("msUntilRestock", () => {
  it("counts down within a period and wraps at the boundary", () => {
    const period = SHARD_SHOP.restockPeriodMs;
    const justAfter = Math.ceil(NOW / period) * period + 1;
    expect(msUntilRestock(justAfter)).toBeCloseTo(period - 1, -1);
  });
});

describe("buyFromShardShop", () => {
  it("fails without enough Shard Points", () => {
    const defId = currentShardShopSlots(state, NOW)[0].defId;
    state.shardPoints = 0;
    expect(buyFromShardShop(state, defId, NOW)).toBeNull();
  });

  it("fails for a duck not currently in the rotation", () => {
    state.shardPoints = 999999;
    expect(buyFromShardShop(state, "not-in-shop-id", NOW)).toBeNull();
  });

  it("spends Shard Points and grants the duck", () => {
    const slot = currentShardShopSlots(state, NOW)[0];
    state.shardPoints = slot.price;
    const result = buyFromShardShop(state, slot.defId, NOW);
    expect(result).not.toBeNull();
    expect(state.shardPoints).toBe(0);
    expect(state.ducks.some((d) => d.defId === slot.defId)).toBe(true);
  });
});
