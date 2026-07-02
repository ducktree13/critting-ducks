import { beforeEach, describe, expect, it } from "vitest";
import { ASCENSION, SHARD_CAP } from "./balance";
import { ascendDuck, ascensionCost, canAscend, canUpgrade, openPack, packPrice, packUnlocked, rollRarity, upgradeDuck } from "./packs";
import { assignToRoster, createInitialState, refreshStats } from "./state";
import type { GameState, Rng } from "./types";

// Rng fake that replays a fixed sequence (repeats the last value after).
function seq(values: number[]): Rng {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
}

// High rolls: never crits the pack, never crits, picks last duck in pools.
const NO_CRIT = 0.9999;

let state: GameState;

beforeEach(() => {
  state = createInitialState();
  state.gold = 1_000_000;
  state.packCredits.standard = 0; // clear the new-game welcome pack credit
  refreshStats(state, 0);
});

describe("rollRarity band edges (7 tiers)", () => {
  // Probes sit just inside each band; exact boundaries are FP-fuzzy.
  it.each([
    [0.0, "common"],
    [0.549, "common"],
    [0.551, "uncommon"],
    [0.819, "uncommon"],
    [0.821, "rare"],
    [0.939, "rare"],
    [0.941, "epic"],
    [0.9849, "epic"],
    [0.9851, "legendary"],
    [0.9969, "legendary"],
    [0.9971, "mythic"],
    [0.9994, "mythic"],
    [0.9996, "divine"],
    [0.99999, "divine"],
  ])("roll %f → %s", (roll, rarity) => {
    expect(rollRarity(seq([roll]))).toBe(rarity);
  });
});

describe("welcome pack", () => {
  it("grants a free standard pack credit to brand-new games", () => {
    const fresh = createInitialState();
    expect(fresh.packCredits.standard).toBe(1);
  });
});

describe("pack tiers", () => {
  it("charges full price per tier with no bulk discount", () => {
    expect(packPrice("standard", state, 0)).toBe(150);
    expect(packPrice("five", state, 0)).toBe(750);
    expect(packPrice("pack25", state, 0)).toBe(3750);
    expect(packPrice("pack100", state, 0)).toBe(15000);
  });

  it("locks the 100-pack below player level 20", () => {
    expect(packUnlocked("pack100", state)).toBe(false);
    expect(openPack(state, seq([NO_CRIT]), "pack100", 0)).toBeNull();
    state.level = 20;
    expect(packUnlocked("pack100", state)).toBe(true);
  });

  it("returns null without enough gold", () => {
    state.gold = 149;
    expect(openPack(state, seq([NO_CRIT]), "standard", 0)).toBeNull();
    expect(state.gold).toBe(149);
  });

  it("opens the right number of rolls per tier", () => {
    state.level = 20;
    const r5 = openPack(state, seq([NO_CRIT]), "five", 0)!;
    expect(r5.results).toHaveLength(5);
    const r25 = openPack(state, seq([NO_CRIT]), "pack25", 0)!;
    expect(r25.results).toHaveLength(25);
    const r100 = openPack(state, seq([NO_CRIT]), "pack100", 0)!;
    expect(r100.results).toHaveLength(100);
  });

  it("five-pack bumps the last roll to uncommon when all rolls were common", () => {
    // rarity rolls 0.0 (common) + duck picks 0.0; last rarity roll bumped.
    // Sequence alternates rarity, duckPick, ..., then the pack-crit roll.
    const rng = seq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NO_CRIT]);
    const results = openPack(state, rng, "five", 0)!.results;
    expect(results.slice(0, 4).every((r) => r.rarity === "common")).toBe(true);
    expect(results[4].rarity).toBe("uncommon");
  });

  it("25-pack guarantees rare-or-better", () => {
    const rolls: number[] = [];
    for (let i = 0; i < 25; i++) rolls.push(0, 0); // all common
    rolls.push(NO_CRIT); // no pack crit
    const results = openPack(state, seq(rolls), "pack25", 0)!.results;
    expect(results[24].rarity).toBe("rare");
  });

  it("does not bump when the guarantee was met naturally", () => {
    // First roll uncommon (0.6), rest common.
    const rng = seq([0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, NO_CRIT]);
    const results = openPack(state, rng, "five", 0)!.results;
    expect(results[0].rarity).toBe("uncommon");
    expect(results[4].rarity).toBe("common");
  });
});

describe("pack crits", () => {
  it("a crit grants a free bonus pack of the same type", () => {
    // standard: rarity, duckPick, packCrit(0 → crit), then bonus pack:
    // rarity, duckPick, packCrit(NO_CRIT → stop)
    const rng = seq([0, 0, 0, 0, 0, NO_CRIT]);
    const before = state.gold;
    const opened = openPack(state, rng, "standard", 0)!;
    expect(opened.bonusPacks).toBe(1);
    expect(opened.results).toHaveLength(2);
    expect(before - state.gold).toBe(150); // bonus pack was free
    expect(state.lifetime.packs).toBe(2);
  });

  it("chains at most 3 bonus packs even at guaranteed crit", () => {
    const alwaysLow: Rng = { next: () => 0 }; // crit roll always succeeds
    refreshStats(state, 0);
    const opened = openPack(state, alwaysLow, "standard", 0)!;
    expect(opened.bonusPacks).toBe(3);
    expect(opened.results).toHaveLength(4);
  });
});

describe("pack credits and T100", () => {
  it("consumes a pack credit before charging gold", () => {
    state.packCredits.standard = 2;
    expect(packPrice("standard", state, 0)).toBe(0);
    openPack(state, seq([0, 0, NO_CRIT]), "standard", 0);
    expect(state.gold).toBe(1_000_000);
    expect(state.packCredits.standard).toBe(1);
  });

  it("packs are free while QUACKENING is active", () => {
    state.streak.buffExpiry.t100 = 10_000;
    expect(packPrice("five", state, 5_000)).toBe(0);
    openPack(state, seq([NO_CRIT]), "five", 5_000);
    expect(state.gold).toBe(1_000_000);
    expect(packPrice("five", state, 10_000)).toBe(750); // expired
  });
});

describe("shards", () => {
  it("converts duplicates to shards by rarity", () => {
    // Bill owned from the start; rarity 0 → common, pick 0 → bill
    const opened = openPack(state, seq([0, 0, NO_CRIT]), "standard", 0)!;
    expect(opened.results[0]).toMatchObject({ defId: "bill", isNew: false, shardsGained: 1 });
    expect(state.ducks.find((d) => d.defId === "bill")!.shards).toBe(1);
  });

  it("overflow past the shard cap becomes Shard Points", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.shards = SHARD_CAP;
    openPack(state, seq([0, 0, NO_CRIT]), "standard", 0);
    expect(bill.shards).toBe(SHARD_CAP);
    expect(state.shardPoints).toBe(1);
  });

  it("upgrade costs the current level in shards", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.shards = 3;
    expect(upgradeDuck(state, "bill")).toBe(true); // cost 1
    expect(bill.level).toBe(2);
    expect(upgradeDuck(state, "bill")).toBe(true); // cost 2
    expect(bill.shards).toBe(0);
    expect(canUpgrade(state, "bill")).toBe(false);
  });
});

describe("ascension", () => {
  it("requires max level before ascending", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.shards = 9999;
    expect(canAscend(state, "bill")).toBe(false);
    bill.level = 10;
    expect(canAscend(state, "bill")).toBe(true);
  });

  it("costs 20x the duck's dupe-shard value", () => {
    // bill is common (dupeShards 1) -> cost 20
    expect(ascensionCost("bill")).toBe(20 * 1);
    // goose is legendary (dupeShards 10) -> cost 200
    expect(ascensionCost("goose")).toBe(20 * 10);
  });

  it("resets level to 1 but keeps a permanent stat multiplier", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.level = 10;
    bill.shards = ascensionCost("bill");
    expect(ascendDuck(state, "bill")).toBe(true);
    expect(bill.level).toBe(1);
    expect(bill.ascension).toBe(1);
    expect(bill.shards).toBe(0);
  });

  it("caps at the max ascension count", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.level = 10;
    bill.ascension = ASCENSION.maxAscensions;
    bill.shards = 9999;
    expect(canAscend(state, "bill")).toBe(false);
    expect(ascendDuck(state, "bill")).toBe(false);
  });

  it("refuses to ascend without enough shards", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.level = 10;
    bill.shards = ascensionCost("bill") - 1;
    expect(ascendDuck(state, "bill")).toBe(false);
    expect(bill.level).toBe(10);
  });
});

describe("assignToRoster", () => {
  beforeEach(() => {
    state.ducks.push({ defId: "quackers", level: 1, shards: 0, nextHitIn: 1 });
    state.rosters.arena = ["quackers"];
  });

  it("moves a duck between rosters (one roster at a time)", () => {
    expect(assignToRoster(state, "mine", 0, "quackers")).toBe(true);
    expect(state.rosters.mine).toEqual(["quackers"]);
    expect(state.rosters.arena).toEqual([]);
  });

  it("rejects slots beyond the unlocked count", () => {
    expect(assignToRoster(state, "mine", 1, "quackers")).toBe(false);
    state.skillNodes = ["mineslot2"];
    refreshStats(state, 0);
    expect(assignToRoster(state, "mine", 1, "quackers")).toBe(true);
    expect(state.rosters.mine).toEqual(["bill", "quackers"]);
  });
});
