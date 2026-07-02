import { beforeEach, describe, expect, it } from "vitest";
import { tickMine } from "./mine";
import { createInitialState, refreshStats } from "./state";
import type { GameState, Rng } from "./types";

const alwaysCrit: Rng = { next: () => 0 };
const neverCrit: Rng = { next: () => 0.999 };

let state: GameState;

beforeEach(() => {
  state = createInitialState();
  refreshStats(state, 0);
});

describe("tickMine", () => {
  it("pays ore * vein value without a crit", () => {
    // Bill: miningPower 1.0, so ore = (orePerHit 1 + 1.0) = 2 on copper (1g)
    tickMine(state, 1.0, neverCrit);
    expect(state.gold).toBeCloseTo(2);
    expect(state.ores.copper).toBeCloseTo(2);
    expect(state.lifetime.hits).toBe(1);
    expect(state.lifetime.crits).toBe(0);
  });

  it("multiplies ore by critMult on a crit", () => {
    tickMine(state, 1.0, alwaysCrit);
    expect(state.gold).toBeCloseTo(4); // 2 ore * critMult 2.0
    expect(state.lifetime.crits).toBe(1);
  });

  it("uses the selected vein's gold value", () => {
    state.selectedOre = "silver"; // 3 gold per ore
    refreshStats(state, 0);
    tickMine(state, 1.0, neverCrit);
    expect(state.gold).toBeCloseTo(6); // 2 ore * 3g
    expect(state.ores.silver).toBeCloseTo(2);
    expect(state.ores.copper).toBe(0);
  });

  it("adds the duck's own critDamageBonus to the crit multiplier", () => {
    state.ducks = [{ defId: "sirquack", level: 1, shards: 0, nextHitIn: 1 }];
    state.rosters.mine = ["sirquack"];
    refreshStats(state, 0);
    tickMine(state, 1.0, alwaysCrit);
    // ore = (1 + 0.4 MP) * critMult (2.0 + 0.25) = 3.15
    expect(state.gold).toBeCloseTo(3.15);
  });

  it("scales mining power with duck level", () => {
    state.ducks[0].level = 10; // 1.9x → MP 1.9
    refreshStats(state, 0);
    tickMine(state, 1.0, neverCrit);
    expect(state.gold).toBeCloseTo(1 + 1.9);
  });

  it("lands multiple hits in one tick for fast ducks", () => {
    state.ducks = [{ defId: "pebbles", level: 1, shards: 0, nextHitIn: 1 / 1.3 }];
    state.rosters.mine = ["pebbles"];
    refreshStats(state, 0);
    tickMine(state, 2.0, neverCrit); // 1.3 hits/sec over 2s → 2 hits
    expect(state.lifetime.hits).toBe(2);
  });

  it("grants xp per hit and levels up across thresholds", () => {
    for (let i = 0; i < 100; i++) tickMine(state, 1.0, neverCrit);
    // 100 hits * 1 xp = 100 xp = exactly xpToNext(1)
    expect(state.level).toBe(2);
    expect(state.xp).toBeCloseTo(0);
  });

  it("does nothing with an empty mine roster", () => {
    state.rosters.mine = [];
    refreshStats(state, 0);
    tickMine(state, 5.0, alwaysCrit);
    expect(state.gold).toBe(0);
    expect(state.lifetime.hits).toBe(0);
  });

  it("doubles crit gold when the Golden Goose is rostered in the mine", () => {
    state.ducks = [{ defId: "goose", level: 1, shards: 0, nextHitIn: 1 / 1.2 }];
    state.rosters.mine = ["goose"];
    refreshStats(state, 0);
    tickMine(state, 1 / 1.2, alwaysCrit);
    // ore = (1 + 10) * 2.0 = 22 → gold = 22 * 2 (goldenCrit)
    expect(state.gold).toBeCloseTo(44);
  });
});
