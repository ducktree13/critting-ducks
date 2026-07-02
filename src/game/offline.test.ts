import { beforeEach, describe, expect, it } from "vitest";
import { computeOfflineProgress, offlineIncomePerSec } from "./offline";
import { computeStats, createInitialState } from "./state";
import type { GameState } from "./types";

let state: GameState;

const noBuffStats = () => computeStats(state, Number.MAX_SAFE_INTEGER);

// Bill on copper: 1 hit/s, (0.1 + 0.1 MP) ore, 1g/ore, expected crit factor
// 1 + 0.3 * (2.0 - 1) = 1.3 → 0.26 gold/sec, 1 xp/sec.
const BILL_GOLD_PER_SEC = 0.2 * 1 * 1.3;

beforeEach(() => {
  state = createInitialState();
});

describe("offlineIncomePerSec", () => {
  it("computes expected mine income for the rostered ducks", () => {
    const { goldPerSec, xpPerSec } = offlineIncomePerSec(state, noBuffStats());
    expect(goldPerSec).toBeCloseTo(BILL_GOLD_PER_SEC);
    expect(xpPerSec).toBeCloseTo(1);
  });

  it("returns zero for an empty mine roster", () => {
    state.rosters.mine = [];
    const { goldPerSec, xpPerSec } = offlineIncomePerSec(state, noBuffStats());
    expect(goldPerSec).toBe(0);
    expect(xpPerSec).toBe(0);
  });

  it("uses the selected vein's value and node effects", () => {
    state.selectedOre = "silver";
    state.skillNodes = ["ore1"]; // +0.1 ore per hit
    const { goldPerSec } = offlineIncomePerSec(state, noBuffStats());
    expect(goldPerSec).toBeCloseTo(0.3 * 3 * 1.3); // (0.2 base + 0.1 MP) ore * 3g * crit EV
  });

  it("ignores streak buffs", () => {
    state.streak.buffExpiry.t10 = Number.MAX_SAFE_INTEGER; // would be 1.5x gold if counted
    const { goldPerSec } = offlineIncomePerSec(state, noBuffStats());
    expect(goldPerSec).toBeCloseTo(BILL_GOLD_PER_SEC);
  });
});

describe("computeOfflineProgress", () => {
  it("grants income scaled by elapsed time and offline rate", () => {
    const report = computeOfflineProgress(state, 3600, noBuffStats());
    expect(report.rate).toBeCloseTo(0.5);
    expect(report.goldGained).toBeCloseTo(BILL_GOLD_PER_SEC * 3600 * 0.5);
    // State gold also includes the gold rewards for the levels gained.
    expect(state.gold).toBeGreaterThanOrEqual(report.goldGained);
  });

  it("caps elapsed time at 8 hours", () => {
    const report = computeOfflineProgress(state, 20 * 3600, noBuffStats());
    expect(report.cappedSec).toBe(8 * 3600);
    expect(report.elapsedSec).toBe(20 * 3600);
    expect(report.goldGained).toBeCloseTo(BILL_GOLD_PER_SEC * 8 * 3600 * 0.5);
  });

  it("uses upgraded offline rates from skill nodes", () => {
    state.skillNodes = ["offline1"];
    expect(computeOfflineProgress(state, 3600, noBuffStats()).rate).toBeCloseTo(0.65);
    state.skillNodes = ["offline1", "offline2"];
    expect(computeOfflineProgress(state, 3600, noBuffStats()).rate).toBeCloseTo(0.8);
  });

  it("returns zero for an empty roster", () => {
    state.rosters.mine = [];
    const report = computeOfflineProgress(state, 3600, noBuffStats());
    expect(report.goldGained).toBe(0);
    expect(report.xpGained).toBe(0);
    expect(report.levelsGained).toBe(0);
  });

  it("rolls XP into level-ups", () => {
    // 1 xp/sec at 50% for 3600s → 1800 xp clears the 100/160/256/409.6/655.36
    // thresholds (growth 1.6): level 1 → 6 with ~219 left over
    const report = computeOfflineProgress(state, 3600, noBuffStats());
    expect(report.xpGained).toBeCloseTo(1800);
    expect(report.levelsGained).toBe(5);
    expect(state.level).toBe(6);
    expect(state.xp).toBeCloseTo(1800 - 100 - 160 - 256 - 409.6 - 655.36);
  });
});
