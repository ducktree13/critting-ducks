import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enemyAttackAt,
  enemyAttackFor,
  enemyMaxHpAt,
  enemyTypeForWave,
  groupSizeForWave,
  isBossWave,
  tickArena,
  xpPerKillAt,
} from "./arena";
import { ARENA_BASE, ARENA_GROUPS } from "./balance";
import { createInitialState, refreshStats } from "./state";
import type { GameState, Rng } from "./types";

const neverCrit: Rng = { next: () => 0.999 };
const alwaysLow: Rng = { next: () => 0 }; // crits everything, first pick everywhere

// Returns the given values in order, then repeats the last one forever.
function seqRng(values: number[]): Rng {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
}

let state: GameState;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  state = createInitialState();
  // v2 starts with Bill only; arena tests need a fighter rostered.
  state.ducks.push({ defId: "quackers", level: 1, shards: 0, nextHitIn: 1 });
  state.rosters.arena = ["quackers"];
  refreshStats(state, Date.now());
  tickArena(state, 0, neverCrit); // bootstrap team HP
});

afterEach(() => {
  vi.useRealTimers();
});

function quackers() {
  return state.ducks.find((d) => d.defId === "quackers")!;
}

// Puts the arena on `wave` and forces a fresh spawn through the normal
// between-wave path (retryAt already elapsed).
function jumpToWave(wave: number): void {
  state.arena.wave = wave;
  state.arena.retryAt = Date.now() - 1;
  tickArena(state, 0, neverCrit);
}

describe("wave scaling", () => {
  it("scales enemy hp and attack exponentially", () => {
    expect(enemyMaxHpAt(1)).toBeCloseTo(24);
    expect(enemyMaxHpAt(2)).toBeCloseTo(24 * 1.16);
    expect(enemyAttackAt(1)).toBeCloseTo(2.5);
    expect(enemyAttackAt(5)).toBeCloseTo(2.5 * Math.pow(1.13, 4));
  });

  it("marks every 10th wave as a boss with 3x hp", () => {
    expect(isBossWave(10)).toBe(true);
    expect(isBossWave(11)).toBe(false);
    expect(enemyMaxHpAt(10)).toBeCloseTo(24 * Math.pow(1.16, 9) * 3);
  });
});

describe("group composition", () => {
  it("waves 1-9 are always single", () => {
    for (let w = 1; w <= 9; w++) expect(groupSizeForWave(w)).toBe(1);
  });

  it("bosses are always solo", () => {
    expect(groupSizeForWave(10)).toBe(1);
    expect(groupSizeForWave(20)).toBe(1);
    expect(groupSizeForWave(30)).toBe(1);
  });

  it("wave%3==2 spawns a pair, wave%3==0 a trio, otherwise single (wave >= 10)", () => {
    expect(groupSizeForWave(11)).toBe(2); // 11 % 3 == 2
    expect(groupSizeForWave(12)).toBe(3); // 12 % 3 == 0
    expect(groupSizeForWave(13)).toBe(1); // 13 % 3 == 1
    expect(groupSizeForWave(14)).toBe(2);
    expect(groupSizeForWave(15)).toBe(3);
  });

  it("spawns pair members at 55% of the solo hp each", () => {
    jumpToWave(11);
    expect(state.arena.enemies).toHaveLength(2);
    for (const e of state.arena.enemies) {
      expect(e.maxHp).toBeCloseTo(enemyMaxHpAt(11) * ARENA_GROUPS.pairHpMult);
      expect(e.hp).toBeCloseTo(e.maxHp);
    }
  });

  it("spawns trio members at 40% of the solo hp each", () => {
    jumpToWave(12);
    expect(state.arena.enemies).toHaveLength(3);
    for (const e of state.arena.enemies) {
      expect(e.maxHp).toBeCloseTo(enemyMaxHpAt(12) * ARENA_GROUPS.trioHpMult);
    }
  });

  it("group members each deal 65% of the solo attack; solo waves deal full", () => {
    expect(enemyAttackFor(11)).toBeCloseTo(enemyAttackAt(11) * ARENA_GROUPS.groupAttackMult);
    expect(enemyAttackFor(13)).toBeCloseTo(enemyAttackAt(13));
  });

  it("keeps a wave-11 pair roughly as hard as wave-11 solo (hp x1.1, attack x1.3)", () => {
    const totalHp = 2 * ARENA_GROUPS.pairHpMult;
    const totalAtk = 2 * ARENA_GROUPS.groupAttackMult;
    expect(totalHp).toBeGreaterThan(0.9);
    expect(totalHp).toBeLessThan(1.35);
    expect(totalAtk).toBeGreaterThan(0.9);
    expect(totalAtk).toBeLessThan(1.5);
  });

  it("assigns the cycling enemy type by wave and the pondlord to bosses", () => {
    expect(enemyTypeForWave(1).id).toBe("pond-slime");
    expect(enemyTypeForWave(2).id).toBe("angry-goose");
    expect(enemyTypeForWave(5).id).toBe("pond-slime"); // cycles
    expect(enemyTypeForWave(10).id).toBe("pondlord");
    jumpToWave(11);
    expect(state.arena.enemies.every((e) => e.id === "breadcrumb-golem")).toBe(true);
  });
});

describe("combat", () => {
  it("duck hits damage the enemy and grant xp", () => {
    // Quackers: 1.5 atk * 1.1 (brave trait), 1.0/s; never crit → 1.65 dmg per hit
    tickArena(state, 1.0, neverCrit);
    expect(state.arena.enemies[0].hp).toBeCloseTo(24 - 1.65);
    expect(state.xp).toBeCloseTo(ARENA_BASE.xpPerHit + 0);
    expect(state.lifetime.hits).toBe(1);
  });

  it("ducks target the first living enemy in a group", () => {
    jumpToWave(11);
    tickArena(state, 1.0, neverCrit); // one hit
    expect(state.arena.enemies[0].hp).toBeCloseTo(state.arena.enemies[0].maxHp - 1.65);
    expect(state.arena.enemies[1].hp).toBeCloseTo(state.arena.enemies[1].maxHp);
  });

  it("moves to the next enemy after the first dies, without ending the wave", () => {
    jumpToWave(11);
    state.arena.enemies[0].hp = 1;
    tickArena(state, 1.0, neverCrit); // kills enemy 0
    expect(state.arena.enemies[0].hp).toBeLessThanOrEqual(0);
    expect(state.arena.wave).toBe(11); // wave not over yet
    expect(state.arena.retryAt).toBe(0);
    tickArena(state, 1.0, neverCrit); // next hit lands on enemy 1
    expect(state.arena.enemies[1].hp).toBeCloseTo(state.arena.enemies[1].maxHp - 1.65);
  });

  it("enemy hits the team for max(1, atk - defense)", () => {
    // Wave 1 enemy: 2.5 atk at 0.8/s (first hit at 1.25s); Quackers def 1
    tickArena(state, 1.25, neverCrit);
    expect(state.arena.teamHp).toBeCloseTo(30 - (2.5 - 1));
  });

  it("each group member attacks on its own timer", () => {
    jumpToWave(11);
    quackers().nextHitIn = 999; // only enemies act
    const perHit = Math.max(1, enemyAttackFor(11) - 1); // team defense 1
    tickArena(state, 1.25, neverCrit); // both enemies' first hit lands
    expect(state.arena.teamMaxHp - state.arena.teamHp).toBeCloseTo(2 * perHit);
  });

  it("dead group members stop attacking", () => {
    jumpToWave(11);
    state.arena.enemies[0].hp = 0.0001;
    quackers().nextHitIn = 0.05;
    tickArena(state, 0.1, neverCrit); // duck kills enemy 0
    expect(state.arena.enemies[0].hp).toBeLessThanOrEqual(0);
    quackers().nextHitIn = 999;
    const hp0 = state.arena.teamHp;
    tickArena(state, 1.25, neverCrit);
    const perHit = Math.max(1, enemyAttackFor(11) - 1);
    expect(hp0 - state.arena.teamHp).toBeCloseTo(perHit); // only one attacker left
  });

  it("victory pays gold and xp, increments the wave, and pauses 1s", () => {
    state.arena.enemies[0].hp = 1; // next hit kills
    state.arena.defeated = ["pond-slime"]; // isolate from the first-defeat bonus
    const gold0 = state.gold;
    const xp0 = state.xp;
    tickArena(state, 1.0, neverCrit);
    expect(state.arena.wave).toBe(2);
    expect(state.gold - gold0).toBeCloseTo(2); // 2 * 1.12^0
    // wave reward + the killing hit + the per-kill xp
    expect(state.xp - xp0).toBeCloseTo(5 + ARENA_BASE.xpPerHit + xpPerKillAt(1));
    expect(state.arena.retryAt).toBe(Date.now() + 1000);
  });

  it("spawns the next enemy at full scaled hp after the pause", () => {
    state.arena.enemies[0].hp = 1;
    tickArena(state, 1.0, neverCrit); // victory → wave 2
    vi.setSystemTime(Date.now() + 1001);
    tickArena(state, 0.1, neverCrit);
    expect(state.arena.enemies[0].maxHp).toBeCloseTo(24 * 1.16);
    expect(state.arena.enemies[0].hp).toBeCloseTo(state.arena.enemies[0].maxHp);
    expect(state.arena.teamHp).toBe(state.arena.teamMaxHp); // healed
  });

  it("defeat pauses 3s and restarts the same wave at full enemy hp", () => {
    state.arena.teamHp = 1;
    state.arena.enemies[0].nextHitIn = 0.01;
    state.arena.enemies[0].hp = 9999;
    state.arena.enemies[0].maxHp = 9999;
    tickArena(state, 0.1, neverCrit);
    expect(state.arena.retryAt).toBe(Date.now() + 3000);
    expect(state.arena.wave).toBe(1);

    vi.setSystemTime(Date.now() + 3001);
    tickArena(state, 0.05, neverCrit);
    expect(state.arena.teamHp).toBe(state.arena.teamMaxHp);
    expect(state.arena.enemies[0].hp).toBeCloseTo(24); // same wave, fresh enemy
  });

  it("idles with an empty arena roster", () => {
    state.rosters.arena = [];
    tickArena(state, 5.0, neverCrit);
    expect(state.arena.wave).toBe(1);
    expect(state.arena.enemies[0].hp).toBeCloseTo(24);
    expect(state.lifetime.hits).toBe(0);
    expect(state.arena.teamMaxHp).toBe(0);
  });
});

describe("enemy crits", () => {
  it("crit hits deal enemyCritMult x damage", () => {
    // No duck attacks; the only rng roll is the enemy's crit roll.
    quackers().nextHitIn = 999;
    tickArena(state, 1.25, seqRng([0])); // 0 < 0.05 → crit
    const perHit = Math.max(1, enemyAttackAt(1) - 1); // 1.5
    expect(state.arena.teamMaxHp - state.arena.teamHp).toBeCloseTo(
      perHit * ARENA_BASE.enemyCritMult,
    );
  });

  it("non-crit rolls deal normal damage", () => {
    quackers().nextHitIn = 999;
    tickArena(state, 1.25, seqRng([ARENA_BASE.enemyCritChance])); // at threshold → no crit
    expect(state.arena.teamMaxHp - state.arena.teamHp).toBeCloseTo(
      Math.max(1, enemyAttackAt(1) - 1),
    );
  });

  it("bosses use the higher bossCritChance", () => {
    jumpToWave(10);
    quackers().nextHitIn = 999;
    // A roll between the normal and boss chance crits only for the boss.
    const roll = (ARENA_BASE.enemyCritChance + ARENA_BASE.bossCritChance) / 2;
    tickArena(state, 1.25, seqRng([roll]));
    const perHit = Math.max(1, enemyAttackAt(10) - 1);
    expect(state.arena.teamMaxHp - state.arena.teamHp).toBeCloseTo(
      perHit * ARENA_BASE.enemyCritMult,
    );
  });
});

describe("per-kill xp and first defeats", () => {
  it("grants xpPerKill on each enemy death mid-wave", () => {
    jumpToWave(11);
    state.arena.defeated = ["breadcrumb-golem"]; // isolate from the first-defeat bonus
    state.arena.enemies[0].hp = 1;
    const xp0 = state.xp;
    tickArena(state, 1.0, neverCrit); // kills enemy 0, wave continues
    expect(state.arena.wave).toBe(11);
    expect(state.xp - xp0).toBeCloseTo(ARENA_BASE.xpPerHit + xpPerKillAt(11));
  });

  it("grants the first-defeat bonus exactly once per enemy type", () => {
    state.arena.enemies[0].hp = 1;
    const xp0 = state.xp;
    tickArena(state, 1.0, neverCrit); // first pond-slime kill ever
    const bonus = ARENA_BASE.firstDefeatXp + ARENA_BASE.firstDefeatKillMult * xpPerKillAt(1);
    expect(state.xp - xp0).toBeCloseTo(ARENA_BASE.xpPerHit + xpPerKillAt(1) + 5 + bonus);
    expect(state.arena.defeated).toContain("pond-slime");

    // Wave 5 is a pond-slime again: no second bonus.
    jumpToWave(5);
    state.arena.enemies[0].hp = 1;
    const xp1 = state.xp;
    tickArena(state, 1.0, neverCrit);
    const waveXp = ARENA_BASE.baseXpReward * Math.pow(ARENA_BASE.xpRewardGrowth, 4);
    expect(state.xp - xp1).toBeCloseTo(ARENA_BASE.xpPerHit + xpPerKillAt(5) + waveXp);
    expect(state.arena.defeated.filter((id) => id === "pond-slime")).toHaveLength(1);
  });

  it("counts the pondlord as its own first defeat", () => {
    jumpToWave(10);
    state.arena.enemies[0].hp = 1;
    tickArena(state, 1.0, neverCrit);
    expect(state.arena.defeated).toContain("pondlord");
  });
});

describe("rewards", () => {
  it("boss waves pay double and always drop a shard", () => {
    jumpToWave(10);
    state.arena.enemies[0].hp = 1;
    const gold0 = state.gold;
    tickArena(state, 1.0, neverCrit); // kill: rng.next()=0.999 → no random shard, but boss guarantees
    expect(state.gold - gold0).toBeCloseTo(2 * Math.pow(1.12, 9) * 2);
    expect(state.ducks.find((d) => d.defId === "quackers")!.shards).toBe(1);
    expect(state.arena.wave).toBe(11);
  });

  it("normal waves drop a shard 10% of the time", () => {
    state.arena.enemies[0].hp = 1;
    tickArena(state, 1.0, alwaysLow); // shard roll 0 < 0.1 → drop
    expect(state.ducks.find((d) => d.defId === "quackers")!.shards).toBe(1);
  });

  it("arena crits feed the global streak", () => {
    tickArena(state, 1.0, alwaysLow);
    expect(state.streak.current).toBeGreaterThan(0);
  });
});
