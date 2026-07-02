import { beforeEach, describe, expect, it } from "vitest";
import { POND } from "./balance";
import { DUCK_DEFS, hpOf, passivePowerOf } from "./ducks";
import { pondIncomePerSec, tickPond } from "./pond";
import { assignToRoster, createInitialState, refreshStats } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

const NEVER: Rng = { next: () => 0.999 };
const ALWAYS: Rng = { next: () => 0 };

let state: GameState;
let stats: DerivedStats;

beforeEach(() => {
  state = createInitialState();
  state.ducks.push({ defId: "puddle", level: 1, shards: 0, nextHitIn: 1 });
  assignToRoster(state, "pond", 0, "puddle");
  stats = refreshStats(state, 0);
});

describe("passivePowerOf", () => {
  it("derives from effective hp, so rarity/level/ascension all matter for free", () => {
    const puddle = state.ducks.find((d) => d.defId === "puddle")!;
    expect(passivePowerOf(state, puddle)).toBeCloseTo(hpOf(state, puddle) * 0.02, 5);
  });

  it("lazy ducks contribute 20% more per unit of hp than a neutral duck", () => {
    const lazyDef = DUCK_DEFS.find((d) => d.trait === "lazy")!;
    const lazyDuck = { defId: lazyDef.id, level: 1, shards: 0, nextHitIn: 1 };
    const perHp = passivePowerOf(state, lazyDuck) / lazyDef.hp;
    expect(perHp).toBeCloseTo(POND.passivePowerFromHp * 1.2);
  });
});

describe("pondIncomePerSec", () => {
  it("is zero with an empty pond roster", () => {
    state.rosters.pond = [];
    const income = pondIncomePerSec(state, stats);
    expect(income.goldPerSec).toBe(0);
    expect(income.xpPerSec).toBe(0);
  });

  it("scales with total passive power and goldMult/xpMult", () => {
    const income = pondIncomePerSec(state, stats);
    expect(income.goldPerSec).toBeGreaterThan(0);
    expect(income.xpPerSec).toBeGreaterThan(0);
  });
});

describe("tickPond", () => {
  it("grants gold and xp proportional to dt", () => {
    const goldBefore = state.gold;
    const xpBefore = state.xp;
    tickPond(state, 1.0, NEVER, stats);
    expect(state.gold).toBeGreaterThan(goldBefore);
    expect(state.xp).toBeGreaterThan(xpBefore);
  });

  it("does nothing with an empty pond roster", () => {
    state.rosters.pond = [];
    const goldBefore = state.gold;
    tickPond(state, 5.0, ALWAYS, stats);
    expect(state.gold).toBe(goldBefore);
  });

  it("can occasionally grant a material", () => {
    const before = Object.values(state.materials).reduce((a, b) => a + b, 0);
    tickPond(state, 100, ALWAYS, stats); // large dt + always-low rng forces the roll
    const after = Object.values(state.materials).reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before);
  });
});
