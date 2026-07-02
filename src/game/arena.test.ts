import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enemyAttackAt, enemyMaxHpAt, isBossWave, tickArena } from "./arena";
import { ARENA_BASE } from "./balance";
import { createInitialState, refreshStats } from "./state";
import type { GameState, Rng } from "./types";

const neverCrit: Rng = { next: () => 0.999 };
const alwaysLow: Rng = { next: () => 0 }; // crits everything, first pick everywhere

let state: GameState;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  state = createInitialState();
  refreshStats(state, Date.now());
  tickArena(state, 0, neverCrit); // bootstrap team HP
});

afterEach(() => {
  vi.useRealTimers();
});

describe("wave scaling", () => {
  it("scales enemy hp and attack exponentially", () => {
    expect(enemyMaxHpAt(1)).toBeCloseTo(30);
    expect(enemyMaxHpAt(2)).toBeCloseTo(30 * 1.18);
    expect(enemyAttackAt(1)).toBeCloseTo(3);
    expect(enemyAttackAt(5)).toBeCloseTo(3 * Math.pow(1.15, 4));
  });

  it("marks every 10th wave as a boss with 3x hp", () => {
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(11)).toBe(false);
    expect(enemyMaxHpAt(10)).toBeCloseTo(30 * Math.pow(1.18, 9) * 3);
  });
});

describe("combat", () => {
  it("duck hits damage the enemy and grant xp", () => {
    // Quackers: 3 atk, 1.0/s; never crit → 3 dmg per hit
    tickArena(state, 1.0, neverCrit);
    expect(state.arena.enemyHp).toBeCloseTo(30 - 3);
    expect(state.xp).toBeCloseTo(ARENA_BASE.xpPerHit + 0);
    expect(state.lifetime.hits).toBe(1);
  });

  it("enemy hits the team for max(1, atk - defense)", () => {
    // Wave 1 enemy: 3 atk at 0.8/s (first hit at 1.25s); Quackers def 1
    tickArena(state, 1.25, neverCrit);
    expect(state.arena.teamHp).toBeCloseTo(30 - (3 - 1));
  });

  it("victory pays gold and xp, increments the wave, and pauses 1s", () => {
    state.arena.enemyHp = 1; // next hit kills
    const gold0 = state.gold;
    const xp0 = state.xp;
    tickArena(state, 1.0, neverCrit);
    expect(state.arena.wave).toBe(2);
    expect(state.gold - gold0).toBeCloseTo(10); // 10 * 1.15^0
    expect(state.xp - xp0).toBeCloseTo(15 + ARENA_BASE.xpPerHit); // reward + the killing hit
    expect(state.arena.retryAt).toBe(Date.now() + 1000);
  });

  it("spawns the next enemy at full scaled hp after the pause", () => {
    state.arena.enemyHp = 1;
    tickArena(state, 1.0, neverCrit); // victory → wave 2
    vi.setSystemTime(Date.now() + 1001);
    tickArena(state, 0.1, neverCrit);
    expect(state.arena.enemyMaxHp).toBeCloseTo(30 * 1.18);
    expect(state.arena.enemyHp).toBeCloseTo(state.arena.enemyMaxHp);
    expect(state.arena.teamHp).toBe(state.arena.teamMaxHp); // healed
  });

  it("defeat pauses 3s and restarts the same wave at full enemy hp", () => {
    state.arena.teamHp = 1;
    state.arena.enemyNextHitIn = 0.01;
    state.arena.enemyHp = 9999;
    state.arena.enemyMaxHp = 9999;
    tickArena(state, 0.1, neverCrit);
    expect(state.arena.retryAt).toBe(Date.now() + 3000);
    expect(state.arena.wave).toBe(1);

    vi.setSystemTime(Date.now() + 3001);
    tickArena(state, 0.05, neverCrit);
    expect(state.arena.teamHp).toBe(state.arena.teamMaxHp);
    expect(state.arena.enemyHp).toBeCloseTo(30); // same wave, fresh enemy
  });

  it("idles with an empty arena roster", () => {
    state.rosters.arena = [];
    tickArena(state, 5.0, neverCrit);
    expect(state.arena.wave).toBe(1);
    expect(state.arena.enemyHp).toBeCloseTo(30);
    expect(state.lifetime.hits).toBe(0);
    expect(state.arena.teamMaxHp).toBe(0);
  });
});

describe("rewards", () => {
  it("boss waves pay double and always drop a shard", () => {
    state.arena.wave = 10;
    state.arena.enemyHp = 1;
    state.arena.enemyMaxHp = enemyMaxHpAt(10);
    const gold0 = state.gold;
    tickArena(state, 1.0, neverCrit); // kill: rng.next()=0.999 → no random shard, but boss guarantees
    expect(state.gold - gold0).toBeCloseTo(10 * Math.pow(1.15, 9) * 2);
    expect(state.ducks.find((d) => d.defId === "quackers")!.shards).toBe(1);
    expect(state.arena.wave).toBe(11);
  });

  it("normal waves drop a shard 10% of the time", () => {
    state.arena.enemyHp = 1;
    tickArena(state, 1.0, alwaysLow); // shard roll 0 < 0.1 → drop
    expect(state.ducks.find((d) => d.defId === "quackers")!.shards).toBe(1);
  });

  it("arena crits feed the global streak", () => {
    tickArena(state, 1.0, alwaysLow);
    expect(state.streak.current).toBeGreaterThan(0);
  });
});
