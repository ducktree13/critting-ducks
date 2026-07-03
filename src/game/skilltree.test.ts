import { beforeEach, describe, expect, it } from "vitest";
import { buy, canBuy, isVisible, nodesForTree, SKILL_NODES } from "./skilltree";
import { createInitialState, refreshStats } from "./state";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("purchase gating", () => {
  it("root node is buyable with enough gold at level 1", () => {
    state.gold = 30;
    expect(canBuy(state, "crit1")).toBe(true);
  });

  it("blocks purchase without enough gold", () => {
    state.gold = 29;
    expect(canBuy(state, "crit1")).toBe(false);
    expect(buy(state, "crit1")).toBe(false);
    expect(state.skillNodes).toEqual([]);
  });

  it("blocks children until the parent is owned", () => {
    state.gold = 10_000;
    expect(isVisible(state, "speed1")).toBe(false);
    expect(canBuy(state, "speed1")).toBe(false);
    buy(state, "crit1");
    expect(isVisible(state, "speed1")).toBe(true);
    expect(canBuy(state, "speed1")).toBe(true);
  });

  it("blocks purchase below minLevel", () => {
    state.gold = 10_000;
    buy(state, "crit1");
    buy(state, "speed1");
    expect(canBuy(state, "crit2")).toBe(false); // needs level 2
    state.level = 2;
    expect(canBuy(state, "crit2")).toBe(true);
  });

  it("deducts gold and records the node on purchase", () => {
    state.gold = 120;
    expect(buy(state, "crit1")).toBe(true);
    expect(state.gold).toBe(90);
    expect(state.skillNodes).toEqual(["crit1"]);
    expect(buy(state, "crit1")).toBe(false); // no double-buy
  });
});

describe("effect folding in computeStats", () => {
  it("adds flat crit chance", () => {
    state.skillNodes = ["crit1", "crit2"];
    expect(refreshStats(state, 0).critChance).toBeCloseTo(0.4);
  });

  it("multiplies attack speed", () => {
    state.skillNodes = ["speed1"];
    expect(refreshStats(state, 0).attackSpeedMult).toBeCloseTo(1.1);
  });

  it("adds ore per hit and multiplies ore", () => {
    state.skillNodes = ["ore1", "ore2", "ore3"];
    const s = refreshStats(state, 0);
    expect(s.orePerHit).toBeCloseTo(0.4); // 0.1 base + 0.1 + 0.2
    expect(s.oreMult).toBeCloseTo(1.5);
  });

  it("adds roster slots", () => {
    state.skillNodes = ["mineslot2", "mineslot3", "arenaslot2"];
    const s = refreshStats(state, 0);
    expect(s.mineSlots).toBe(3);
    expect(s.arenaSlots).toBe(2);
  });

  it("unlocks ores once both the node and the level gate are met", () => {
    state.skillNodes = ["oresilver", "orecrystal"];
    state.level = 12;
    expect(refreshStats(state, 0).unlockedOres).toEqual(["copper", "silver", "crystal"]);
  });

  it("holds ore unlocks behind their level gates", () => {
    state.skillNodes = ["oresilver", "orecrystal"];
    state.level = 5; // silver's gate met, crystal's (12) not
    expect(refreshStats(state, 0).unlockedOres).toEqual(["copper", "silver"]);
  });

  it("raises the offline rate by tier", () => {
    state.skillNodes = ["offline1"];
    expect(refreshStats(state, 0).offlineRate).toBeCloseTo(0.65);
    state.skillNodes = ["offline1", "offline2"];
    expect(refreshStats(state, 0).offlineRate).toBeCloseTo(0.8);
  });

  it("extends buff duration with Momentum", () => {
    state.skillNodes = ["streak1"];
    expect(refreshStats(state, 0).buffDurationSec).toBe(15);
  });

  it("adds crit damage and folds combat stats", () => {
    state.skillNodes = ["critdmg1", "critdmg2", "critdmg3", "atk1", "atk2", "def1", "def2", "atkspeed1"];
    const s = refreshStats(state, 0);
    expect(s.critMult).toBeCloseTo(3.0); // 2.0 + 0.25 + 0.25 + 0.5
    expect(s.flatAttack).toBe(1);
    expect(s.attackDamageMult).toBeCloseTo(1.25);
    expect(s.flatDefense).toBe(1);
    expect(s.defenseMult).toBeCloseTo(1.5);
    expect(s.arenaSpeedMult).toBeCloseTo(1.25);
  });

  it("caps full-tree crit chance contributions within the cap", () => {
    state.skillNodes = ["crit1", "crit2", "crit3", "crit4", "crit5"];
    expect(refreshStats(state, 0).critChance).toBeCloseTo(0.7); // 0.30 + 0.40
  });

  it("folds packCrit nodes into packCritChance, independent of critChance", () => {
    state.skillNodes = ["x2_luckywrapping", "x2_goldenseams", "p2_luckycharms", "p2_fortunesblessing"];
    const s = refreshStats(state, 0);
    expect(s.packCritChance).toBeCloseTo(0.02 + 0.02 + 0.03 + 0.02 + 0.03); // base 0.02 + four branch nodes
    expect(s.critChance).toBeCloseTo(0.3); // untouched by packCrit nodes
  });
});

describe("Act-2 pack-crit branch nodes", () => {
  it("crit2 and passive2 each seat exactly 16 nodes (14 chain + 2 branch)", () => {
    expect(nodesForTree("crit2")).toHaveLength(16);
    expect(nodesForTree("passive2")).toHaveLength(16);
  });

  it("mining2 and combat2 stay at 14 (no branch added)", () => {
    expect(nodesForTree("mining2")).toHaveLength(14);
    expect(nodesForTree("combat2")).toHaveLength(14);
  });

  it("fully-built pack-crit nodes bring packCritChance to 12% (2% base + 10%)", () => {
    state.skillNodes = [
      "x2_luckywrapping", "x2_goldenseams",
      "p2_luckycharms", "p2_fortunesblessing",
    ];
    expect(refreshStats(state, 0).packCritChance).toBeCloseTo(0.12);
  });
});

describe("node table sanity", () => {
  it("every requires points at a real node", () => {
    const ids = new Set(SKILL_NODES.map((n) => n.id));
    for (const node of SKILL_NODES) {
      if (node.requires) expect(ids.has(node.requires)).toBe(true);
    }
  });

  it("node ids are unique", () => {
    const ids = SKILL_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
