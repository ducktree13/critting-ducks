import { beforeEach, describe, expect, it } from "vitest";
import { LEAVES } from "./balance";
import { clickLeaf, tickLeaves } from "./leaves";
import { createInitialState, refreshStats } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

const NEVER: Rng = { next: () => 0.999 }; // never crits, never duck-tree, picks "xp" branch
const ALWAYS: Rng = { next: () => 0 }; // always crits, always duck-tree

let state: GameState;
let stats: DerivedStats;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  state = createInitialState();
  state.chapter = 2;
  state.nextLeafAt = NOW; // due immediately
  stats = refreshStats(state, NOW);
});

describe("tickLeaves", () => {
  it("does nothing before Act 2 begins", () => {
    state.chapter = 1;
    tickLeaves(state, NOW, NEVER, stats);
    expect(state.leaves).toHaveLength(0);
  });

  it("spawns a leaf once nextLeafAt is due", () => {
    tickLeaves(state, NOW, NEVER, stats);
    expect(state.leaves).toHaveLength(1);
  });

  it("does not spawn early", () => {
    state.nextLeafAt = NOW + 1000;
    tickLeaves(state, NOW, NEVER, stats);
    expect(state.leaves).toHaveLength(0);
  });

  it("schedules the next leaf 3-6 minutes out", () => {
    tickLeaves(state, NOW, NEVER, stats);
    const gap = state.nextLeafAt - NOW;
    expect(gap).toBeGreaterThanOrEqual(LEAVES.minGapMs);
    expect(gap).toBeLessThanOrEqual(LEAVES.maxGapMs);
  });

  it("does not spawn a second leaf while one is still active", () => {
    tickLeaves(state, NOW, NEVER, stats);
    const scheduledAt = state.nextLeafAt;
    // Force due again without clicking the first leaf.
    state.nextLeafAt = NOW + 1;
    tickLeaves(state, NOW + 1, NEVER, stats);
    expect(state.leaves).toHaveLength(1);
    expect(state.nextLeafAt).toBeGreaterThan(scheduledAt);
  });

  it("expires an unclicked leaf after its window", () => {
    tickLeaves(state, NOW, NEVER, stats);
    const leaf = state.leaves[0];
    tickLeaves(state, leaf.expiresAt + 1, NEVER, stats);
    expect(state.leaves).toHaveLength(0);
  });

  it("crits at the player's crit chance for a bonus multiplier", () => {
    tickLeaves(state, NOW, ALWAYS, stats);
    const leaf = state.leaves[0];
    expect(leaf.isCrit).toBe(true);
    // duck-tree roll also always hits with ALWAYS rng, so kind is "duck"
    expect(leaf.kind).toBe("duck");
  });

  it("very rarely grants the leaf-exclusive Duck Tree", () => {
    tickLeaves(state, NOW, ALWAYS, stats);
    expect(state.leaves[0].kind).toBe("duck");
  });
});

describe("clickLeaf", () => {
  it("grants gold and removes the leaf", () => {
    state.leaves.push({ id: "l1", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "gold", amount: 100, isCrit: false });
    const before = state.gold;
    expect(clickLeaf(state, "l1")).toBe(true);
    expect(state.gold).toBe(before + 100);
    expect(state.leaves).toHaveLength(0);
  });

  it("grants xp", () => {
    state.leaves.push({ id: "l2", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "xp", amount: 50, isCrit: false });
    const before = state.xp;
    clickLeaf(state, "l2");
    expect(state.xp).toBe(before + 50);
  });

  it("grants the Duck Tree duck", () => {
    state.leaves.push({ id: "l3", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "duck", amount: 0, isCrit: false });
    clickLeaf(state, "l3");
    expect(state.ducks.some((d) => d.defId === "duckTree")).toBe(true);
  });

  it("returns false for an already-gone leaf", () => {
    expect(clickLeaf(state, "nope")).toBe(false);
  });
});
