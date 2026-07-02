import { beforeEach, describe, expect, it } from "vitest";
import { canUpgrade, openPack, packPrice, rollRarity, upgradeDuck } from "./shop";
import { assignToRoster, createInitialState, refreshStats } from "./state";
import type { GameState, Rng } from "./types";

// Rng fake that replays a fixed sequence (repeats the last value after).
function seq(values: number[]): Rng {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
}

let state: GameState;

beforeEach(() => {
  state = createInitialState();
  state.gold = 100_000;
  refreshStats(state, 0);
});

describe("rollRarity band edges", () => {
  it.each([
    [0.0, "common"],
    [0.599, "common"],
    [0.6, "uncommon"],
    [0.849, "uncommon"],
    [0.85, "rare"],
    [0.949, "rare"],
    [0.95, "epic"],
    [0.989, "epic"],
    [0.99, "legendary"],
    [0.9999, "legendary"],
  ])("roll %f → %s", (roll, rarity) => {
    expect(rollRarity(seq([roll]))).toBe(rarity);
  });
});

describe("openPack", () => {
  it("deducts the pack price and grants one duck", () => {
    // rarity 0.7 → uncommon; duck pick 0.0 → first uncommon (goldie)
    const results = openPack(state, seq([0.7, 0.0]), "standard", 0);
    expect(state.gold).toBe(100_000 - 100);
    expect(results).toHaveLength(1);
    expect(results![0]).toMatchObject({ defId: "goldie", rarity: "uncommon", isNew: true });
    expect(state.ducks.some((d) => d.defId === "goldie")).toBe(true);
    expect(state.lifetime.packs).toBe(1);
  });

  it("returns null without enough gold", () => {
    state.gold = 99;
    expect(openPack(state, seq([0.5]), "standard", 0)).toBeNull();
    expect(state.gold).toBe(99);
  });

  it("converts duplicates to shards by rarity", () => {
    // Bill is owned from the start; rarity 0.0 → common, pick 0.0 → bill
    const results = openPack(state, seq([0.0, 0.0]), "standard", 0);
    expect(results![0]).toMatchObject({ defId: "bill", isNew: false, shardsGained: 1 });
    expect(state.ducks.find((d) => d.defId === "bill")!.shards).toBe(1);

    // A legendary dupe pays 10: grant goose twice
    openPack(state, seq([0.995, 0.0, 0.995, 0.0]), "standard", 0);
    const second = openPack(state, seq([0.995, 0.0]), "standard", 0);
    expect(second![0].shardsGained).toBe(10);
  });

  it("five-pack rolls five ducks for 450 gold", () => {
    const results = openPack(state, seq([0.0, 0.0]), "five", 0);
    expect(results).toHaveLength(5);
    expect(state.gold).toBe(100_000 - 450);
    expect(state.lifetime.packs).toBe(1);
  });

  it("five-pack guarantees uncommon-or-better on the last roll", () => {
    // All rarity rolls come up common (0.0)
    const results = openPack(state, seq([0.0]), "five", 0);
    const rarities = results!.map((r) => r.rarity);
    expect(rarities.slice(0, 4)).toEqual(["common", "common", "common", "common"]);
    expect(rarities[4]).toBe("uncommon");
  });

  it("five-pack does not bump the last roll if an uncommon+ already dropped", () => {
    // Rolls: uncommon, then commons
    const results = openPack(state, seq([0.7, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]), "five", 0);
    expect(results![0].rarity).toBe("uncommon");
    expect(results![4].rarity).toBe("common");
  });

  it("packs are free while QUACKENING is active", () => {
    state.streak.buffExpiry.t100 = 10_000;
    expect(packPrice("standard", state, 5_000)).toBe(0);
    expect(packPrice("five", state, 5_000)).toBe(0);
    openPack(state, seq([0.0, 0.0]), "standard", 5_000);
    expect(state.gold).toBe(100_000);
    expect(packPrice("standard", state, 10_000)).toBe(100); // expired
  });
});

describe("upgrades", () => {
  it("level N → N+1 costs N shards, capped at level 10", () => {
    const bill = state.ducks.find((d) => d.defId === "bill")!;
    bill.shards = 3;
    expect(upgradeDuck(state, "bill")).toBe(true); // cost 1
    expect(bill.level).toBe(2);
    expect(bill.shards).toBe(2);
    expect(upgradeDuck(state, "bill")).toBe(true); // cost 2
    expect(bill.level).toBe(3);
    expect(bill.shards).toBe(0);
    expect(canUpgrade(state, "bill")).toBe(false); // needs 3 shards now

    bill.level = 10;
    bill.shards = 99;
    expect(canUpgrade(state, "bill")).toBe(false); // max level
  });
});

describe("assignToRoster", () => {
  it("moves a duck between rosters (one roster at a time)", () => {
    // Quackers starts in arena slot 0
    expect(assignToRoster(state, "mine", 0, "quackers")).toBe(true);
    expect(state.rosters.mine).toEqual(["quackers"]);
    expect(state.rosters.arena).toEqual([]);
  });

  it("rejects slots beyond the unlocked count", () => {
    expect(assignToRoster(state, "mine", 1, "quackers")).toBe(false); // only 1 slot
    state.skillNodes = ["mineslot2"];
    refreshStats(state, 0);
    expect(assignToRoster(state, "mine", 1, "quackers")).toBe(true);
    expect(state.rosters.mine).toEqual(["bill", "quackers"]);
  });

  it("rejects ducks that are not owned and clears slots", () => {
    expect(assignToRoster(state, "mine", 0, "goose")).toBe(false);
    expect(assignToRoster(state, "mine", 0, null)).toBe(true);
    expect(state.rosters.mine).toEqual([]);
  });
});
