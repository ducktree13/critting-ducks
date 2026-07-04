import { beforeEach, describe, expect, it } from "vitest";
import { BUBBLES } from "./balance";
import { popBubble, tickBubbles } from "./bubbles";
import { createInitialState, refreshStats } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

const NEVER: Rng = { next: () => 0.999 }; // never crits, never duck-tree, picks "xp" branch
const ALWAYS: Rng = { next: () => 0 }; // always crits, always duck-tree

let state: GameState;
let stats: DerivedStats;
const NOW = 1_700_000_000_000;

beforeEach(() => {
  state = createInitialState();
  state.nextBubbleAt = NOW; // due immediately
  stats = refreshStats(state, NOW);
});

describe("tickBubbles", () => {
  it("spawns from chapter 1 onward (pond is core to the early game)", () => {
    state.chapter = 1;
    tickBubbles(state, NOW, NEVER, stats);
    expect(state.bubbles).toHaveLength(1);
  });

  it("spawns a bubble once nextBubbleAt is due", () => {
    tickBubbles(state, NOW, NEVER, stats);
    expect(state.bubbles).toHaveLength(1);
  });

  it("does not spawn early", () => {
    state.nextBubbleAt = NOW + 1000;
    tickBubbles(state, NOW, NEVER, stats);
    expect(state.bubbles).toHaveLength(0);
  });

  it("schedules the next bubble 3-6 minutes out", () => {
    tickBubbles(state, NOW, NEVER, stats);
    const gap = state.nextBubbleAt - NOW;
    expect(gap).toBeGreaterThanOrEqual(BUBBLES.minGapMs);
    expect(gap).toBeLessThanOrEqual(BUBBLES.maxGapMs);
  });

  it("does not spawn a second bubble while one is still active", () => {
    tickBubbles(state, NOW, NEVER, stats);
    const scheduledAt = state.nextBubbleAt;
    // Force due again without popping the first bubble.
    state.nextBubbleAt = NOW + 1;
    tickBubbles(state, NOW + 1, NEVER, stats);
    expect(state.bubbles).toHaveLength(1);
    expect(state.nextBubbleAt).toBeGreaterThan(scheduledAt);
  });

  it("expires an unpopped bubble after its window", () => {
    tickBubbles(state, NOW, NEVER, stats);
    const bubble = state.bubbles[0];
    tickBubbles(state, bubble.expiresAt + 1, NEVER, stats);
    expect(state.bubbles).toHaveLength(0);
  });

  it("crits at the player's crit chance for a bonus multiplier", () => {
    tickBubbles(state, NOW, ALWAYS, stats);
    const bubble = state.bubbles[0];
    expect(bubble.isCrit).toBe(true);
    // duck-tree roll also always hits with ALWAYS rng, so kind is "duck"
    expect(bubble.kind).toBe("duck");
  });

  it("very rarely grants the bubble-exclusive Duck Tree", () => {
    tickBubbles(state, NOW, ALWAYS, stats);
    expect(state.bubbles[0].kind).toBe("duck");
  });
});

describe("popBubble", () => {
  it("grants gold and removes the bubble", () => {
    state.bubbles.push({ id: "b1", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "gold", amount: 100, isCrit: false });
    const before = state.gold;
    expect(popBubble(state, "b1")).toBe(true);
    expect(state.gold).toBe(before + 100);
    expect(state.bubbles).toHaveLength(0);
  });

  it("grants xp", () => {
    state.bubbles.push({ id: "b2", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "xp", amount: 50, isCrit: false });
    const before = state.xp;
    popBubble(state, "b2");
    expect(state.xp).toBe(before + 50);
  });

  it("grants the Duck Tree duck", () => {
    state.bubbles.push({ id: "b3", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "duck", amount: 0, isCrit: false });
    popBubble(state, "b3");
    expect(state.ducks.some((d) => d.defId === "duckTree")).toBe(true);
  });

  it("increments lifetime.bubblesPopped", () => {
    state.bubbles.push({ id: "b4", spawnedAt: NOW, expiresAt: NOW + 30000, kind: "gold", amount: 100, isCrit: false });
    popBubble(state, "b4");
    expect(state.lifetime.bubblesPopped).toBe(1);
  });

  it("returns false for an already-gone bubble", () => {
    expect(popBubble(state, "nope")).toBe(false);
  });
});
