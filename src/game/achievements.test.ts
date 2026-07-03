import { beforeEach, describe, expect, it } from "vitest";
import { ACHIEVEMENTS, checkAchievements } from "./achievements";
import { createInitialState } from "./state";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("checkAchievements", () => {
  it("does nothing before any threshold is met", () => {
    checkAchievements(state);
    expect(state.achievementsCompleted).toEqual([]);
  });

  it("completes an achievement and grants its gold reward exactly once", () => {
    state.lifetime.crits = 1; // firstCrit target
    const goldBefore = state.gold;

    checkAchievements(state);
    expect(state.achievementsCompleted).toContain("firstCrit");
    expect(state.gold).toBe(goldBefore + 20);

    checkAchievements(state); // idempotent — no double payout
    expect(state.gold).toBe(goldBefore + 20);
    expect(state.achievementsCompleted.filter((id) => id === "firstCrit")).toHaveLength(1);
  });

  it("grants a gold reward for a lifetime-gold achievement", () => {
    state.lifetime.gold = 1000;
    const goldBefore = state.gold;
    checkAchievements(state);
    expect(state.achievementsCompleted).toContain("gold1k");
    expect(state.gold).toBe(goldBefore + 200);
  });

  it("achievement rewards never grant Shard Points directly (SP comes only from dupe overflow)", () => {
    expect(ACHIEVEMENTS.every((a) => a.reward.shardPoints === undefined)).toBe(true);
  });

  it("hidden achievements are flagged and complete like any other", () => {
    const hidden = ACHIEVEMENTS.filter((a) => a.hidden);
    expect(hidden.length).toBeGreaterThanOrEqual(4);
    state.lifetime.divinePulls = 3;
    checkAchievements(state);
    expect(state.achievementsCompleted).toContain("divine3");
  });

  it("grants a packCredits reward", () => {
    state.lifetime.packs = 5;
    checkAchievements(state);
    expect(state.achievementsCompleted).toContain("packs5");
    expect(state.packCredits.standard).toBe(2); // 1 welcome pack + 1 reward
  });

  it("completes every achievement whose threshold is already met in one pass", () => {
    state.lifetime.crits = 1;
    state.lifetime.hits = 100;
    state.lifetime.gold = 10000;
    checkAchievements(state);
    expect(state.achievementsCompleted).toEqual(
      expect.arrayContaining(["firstCrit", "hits100", "gold1k", "gold10k"]),
    );
  });

  it("every achievement id is unique", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
