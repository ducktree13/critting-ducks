import { beforeEach, describe, expect, it } from "vitest";
import { EXPEDITIONS } from "./balance";
import { expeditionPowerOf } from "./ducks";
import {
  checkExpeditions,
  claimExpedition,
  expeditionFailChance,
  isDuckOnExpedition,
  startExpedition,
} from "./expeditions";
import { assignToRoster, computeStats, createInitialState } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

const NEVER: Rng = { next: () => 0.999 }; // never fails, never crits
const ALWAYS: Rng = { next: () => 0 }; // always fails (0 < failChance)

// Returns a fixed sequence of values, then repeats the last one.
function sequence(...values: number[]): Rng {
  let i = 0;
  return { next: () => values[Math.min(i++, values.length - 1)] };
}

let state: GameState;
let stats: DerivedStats;

beforeEach(() => {
  state = createInitialState();
  stats = computeStats(state, Number.MAX_SAFE_INTEGER);
});

describe("startExpedition", () => {
  it("sends an owned duck and marks it away", () => {
    expect(startExpedition(state, "short", ["bill"], 1000)).toBe(true);
    expect(state.expeditions).toHaveLength(1);
    expect(isDuckOnExpedition(state, "bill")).toBe(true);
    expect(state.expeditions[0].endsAt).toBe(1000 + 3600 * 1000);
  });

  it("pulls the duck out of its current roster", () => {
    expect(state.rosters.mine).toContain("bill");
    startExpedition(state, "short", ["bill"], 1000);
    expect(state.rosters.mine).not.toContain("bill");
  });

  it("rejects a duck that's already on an expedition", () => {
    startExpedition(state, "short", ["bill"], 1000);
    expect(startExpedition(state, "long", ["bill"], 2000)).toBe(false);
    expect(state.expeditions).toHaveLength(1);
  });

  it("rejects an unowned duck, an empty roster, and an oversized roster", () => {
    expect(startExpedition(state, "short", ["nugget"], 1000)).toBe(false);
    expect(startExpedition(state, "short", [], 1000)).toBe(false);
    const tooMany = Array.from({ length: EXPEDITIONS.rosterSize + 1 }, () => "bill");
    expect(startExpedition(state, "short", tooMany, 1000)).toBe(false);
  });

  it("blocks assignToRoster for a duck away on expedition", () => {
    startExpedition(state, "short", ["bill"], 1000);
    expect(assignToRoster(state, "mine", 0, "bill")).toBe(false);
  });
});

describe("expeditionFailChance", () => {
  it("follows clamp(0.35 - 0.03*avgLevel - traitBonus, 0.05, 0.6)", () => {
    // Bill is level 1, no expeditionFailReduction trait.
    expect(expeditionFailChance(state, ["bill"])).toBeCloseTo(0.35 - 0.03 * 1);
  });

  it("clamps to the 5%-60% band", () => {
    const duck = state.ducks[0];
    duck.level = 1000; // would drive fail chance deeply negative
    expect(expeditionFailChance(state, ["bill"])).toBeCloseTo(0.05);
  });
});

describe("claimExpedition", () => {
  it("returns null before endsAt", () => {
    startExpedition(state, "short", ["bill"], 1000);
    expect(claimExpedition(state, state.expeditions[0].id, 1000, NEVER, stats)).toBeNull();
  });

  it("grants full rewards and can crit on success", () => {
    startExpedition(state, "short", ["bill"], 1000);
    const id = state.expeditions[0].id;
    const endsAt = state.expeditions[0].endsAt;
    const goldBefore = state.gold;
    // First roll (>= failChance) passes; second roll (< critChance) crits;
    // remaining rolls (material/pack chance) all hit their low-chance branch.
    const result = claimExpedition(state, id, endsAt, sequence(0.99, 0), stats);
    expect(result).not.toBeNull();
    expect(result!.success).toBe(true);
    expect(result!.isCrit).toBe(true);
    expect(state.gold).toBeGreaterThan(goldBefore);
    expect(state.expeditions).toHaveLength(0);
    expect(isDuckOnExpedition(state, "bill")).toBe(false);
  });

  it("pays a reduced amount and no materials on failure", () => {
    startExpedition(state, "short", ["bill"], 1000);
    const id = state.expeditions[0].id;
    const endsAt = state.expeditions[0].endsAt;
    const power = expeditionPowerOf(state, state.ducks[0]);
    const expectedGold = power * EXPEDITIONS.goldPerPowerPerHour * 1 * stats.goldMult * EXPEDITIONS.failPayoutMult;
    const result = claimExpedition(state, id, endsAt, ALWAYS, stats); // ALWAYS: 0 < failChance, always fails
    expect(result!.success).toBe(false);
    expect(result!.materials).toHaveLength(0);
    expect(result!.shardPoints).toBe(0);
    expect(result!.gotPack).toBe(false);
    expect(result!.gold).toBeCloseTo(expectedGold);
  });
});

describe("checkExpeditions", () => {
  it("marks an expedition ready exactly once past its endsAt", () => {
    startExpedition(state, "short", ["bill"], 1000);
    const endsAt = state.expeditions[0].endsAt;
    checkExpeditions(state, endsAt - 1);
    expect(state.expeditions[0].readyNotified).toBeFalsy();
    checkExpeditions(state, endsAt);
    expect(state.expeditions[0].readyNotified).toBe(true);
  });
});
