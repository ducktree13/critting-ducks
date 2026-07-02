import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState, refreshStats } from "./state";
import { gameSpeed, registerHitResult } from "./streak";
import type { DerivedStats, GameState } from "./types";

let state: GameState;
let stats: DerivedStats;

beforeEach(() => {
  state = createInitialState();
  stats = refreshStats(state, 0);
});

function crits(n: number, nowMs: number): void {
  for (let i = 0; i < n; i++) registerHitResult(state, true, nowMs, stats);
}

describe("registerHitResult", () => {
  it("counts crits and tracks best", () => {
    crits(3, 0);
    expect(state.streak.current).toBe(3);
    expect(state.streak.best).toBe(3);
    registerHitResult(state, false, 0, stats);
    expect(state.streak.current).toBe(0);
    expect(state.streak.best).toBe(3);
  });

  it("sets the tier buff expiry when the streak crosses a tier", () => {
    crits(9, 1000);
    expect(state.streak.buffExpiry.t10).toBe(0);
    registerHitResult(state, true, 1000, stats);
    expect(state.streak.current).toBe(10);
    expect(state.streak.buffExpiry.t10).toBe(1000 + stats.buffDurationSec * 1000);
    expect(state.streak.buffExpiry.t25).toBe(0);
  });

  it("refreshes the expiry on every crit at or above the tier", () => {
    crits(12, 1000);
    registerHitResult(state, true, 5000, stats);
    expect(state.streak.buffExpiry.t10).toBe(5000 + stats.buffDurationSec * 1000);
  });

  it("sets every crossed tier's expiry", () => {
    crits(100, 2000);
    const expiry = 2000 + stats.buffDurationSec * 1000;
    expect(state.streak.buffExpiry).toEqual({ t10: expiry, t25: expiry, t50: expiry, t100: expiry });
  });

  it("resets the streak on a non-crit but preserves buff expiries", () => {
    crits(10, 1000);
    const t10 = state.streak.buffExpiry.t10;
    registerHitResult(state, false, 2000, stats);
    expect(state.streak.current).toBe(0);
    expect(state.streak.buffExpiry.t10).toBe(t10);
  });

  it("Streak Shield forgives one non-crit per 60s while Deathbill is rostered", () => {
    state.ducks.push({ defId: "deathbill", level: 1, shards: 0, nextHitIn: 1 });
    state.rosters.arena = ["deathbill"];
    crits(5, 0);

    registerHitResult(state, false, 10_000, stats); // shield eats it
    expect(state.streak.current).toBe(5);
    expect(state.streak.shieldReadyAt).toBe(70_000);

    registerHitResult(state, false, 20_000, stats); // still on cooldown
    expect(state.streak.current).toBe(0);

    crits(4, 60_000);
    registerHitResult(state, false, 70_000, stats); // cooldown elapsed
    expect(state.streak.current).toBe(4);
  });

  it("does not consume the shield without Deathbill rostered", () => {
    crits(5, 0);
    registerHitResult(state, false, 0, stats);
    expect(state.streak.current).toBe(0);
    expect(state.streak.shieldReadyAt).toBe(0);
  });
});

describe("gameSpeed", () => {
  it("scales 1% per streak point and caps at 2.0x", () => {
    expect(gameSpeed(state)).toBe(1);
    state.streak.current = 50;
    expect(gameSpeed(state)).toBeCloseTo(1.5);
    state.streak.current = 100;
    expect(gameSpeed(state)).toBeCloseTo(2.0);
    state.streak.current = 250;
    expect(gameSpeed(state)).toBeCloseTo(2.0);
  });
});

describe("computeStats streak buffs", () => {
  it("applies T10 gold buff only while unexpired", () => {
    state.streak.buffExpiry.t10 = 10_000;
    expect(refreshStats(state, 9_999).goldMult).toBeCloseTo(1.5);
    expect(refreshStats(state, 10_000).goldMult).toBe(1);
  });

  it("applies T25 xp and T50 damage buffs", () => {
    state.streak.buffExpiry.t25 = 10_000;
    state.streak.buffExpiry.t50 = 10_000;
    const s = refreshStats(state, 0);
    expect(s.xpMult).toBeCloseTo(1.5);
    expect(s.attackDamageMult).toBeCloseTo(1.5);
  });

  it("QUACKENING boosts all stats and stacks with lower tiers", () => {
    state.streak.buffExpiry = { t10: 10_000, t25: 10_000, t50: 10_000, t100: 10_000 };
    const s = refreshStats(state, 0);
    expect(s.critChance).toBeCloseTo(0.4); // 0.30 + 0.10 flat
    expect(s.oreMult).toBeCloseTo(1.25);
    expect(s.attackSpeedMult).toBeCloseTo(1.25);
    expect(s.goldMult).toBeCloseTo(1.5 * 1.25);
    expect(s.xpMult).toBeCloseTo(1.5 * 1.25);
    expect(s.attackDamageMult).toBeCloseTo(1.5 * 1.25);
  });

  it("keeps crit chance within the cap under QUACKENING", () => {
    state.streak.buffExpiry.t100 = 10_000;
    const s = refreshStats(state, 0);
    expect(s.critChance).toBeLessThanOrEqual(0.95);
  });
});
