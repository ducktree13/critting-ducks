import { beforeEach, describe, expect, it } from "vitest";
import { DUCK_DEFS } from "./ducks";
import { assignToRoster, createInitialState, isRoleEligible, refreshStats } from "./state";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

// PLAN2.md §4 Phase B: mine accepts miner|hybrid, arena accepts
// fighter|hybrid, pond accepts pond|hybrid. Expedition rosters stay
// role-free (not covered by assignToRoster/isRoleEligible).
describe("isRoleEligible", () => {
  it("lets hybrids into every roster", () => {
    expect(isRoleEligible("mine", "hybrid")).toBe(true);
    expect(isRoleEligible("arena", "hybrid")).toBe(true);
    expect(isRoleEligible("pond", "hybrid")).toBe(true);
  });

  it("mine only accepts miner or hybrid", () => {
    expect(isRoleEligible("mine", "miner")).toBe(true);
    expect(isRoleEligible("mine", "fighter")).toBe(false);
    expect(isRoleEligible("mine", "pond")).toBe(false);
  });

  it("arena only accepts fighter or hybrid", () => {
    expect(isRoleEligible("arena", "fighter")).toBe(true);
    expect(isRoleEligible("arena", "miner")).toBe(false);
    expect(isRoleEligible("arena", "pond")).toBe(false);
  });

  it("pond only accepts pond or hybrid", () => {
    expect(isRoleEligible("pond", "pond")).toBe(true);
    expect(isRoleEligible("pond", "miner")).toBe(false);
    expect(isRoleEligible("pond", "fighter")).toBe(false);
  });
});

describe("assignToRoster role enforcement", () => {
  it("rejects a fighter assigned to the mine", () => {
    state.ducks.push({ defId: "quackers", level: 1, shards: 0, nextHitIn: 1 }); // fighter
    expect(assignToRoster(state, "mine", 0, "quackers")).toBe(false);
    expect(state.rosters.mine).not.toContain("quackers");
  });

  it("rejects a miner assigned to the arena", () => {
    expect(assignToRoster(state, "arena", 0, "bill")).toBe(false); // bill is a miner
    expect(state.rosters.arena).not.toContain("bill");
  });

  it("rejects a pond duck assigned to the arena", () => {
    state.ducks.push({ defId: "puddle", level: 1, shards: 0, nextHitIn: 1 }); // pond
    expect(assignToRoster(state, "arena", 0, "puddle")).toBe(false);
    expect(state.rosters.arena).not.toContain("puddle");
  });

  it("rejects a fighter assigned to the pond", () => {
    state.ducks.push({ defId: "quackers", level: 1, shards: 0, nextHitIn: 1 }); // fighter
    expect(assignToRoster(state, "pond", 0, "quackers")).toBe(false);
    expect(state.rosters.pond).not.toContain("quackers");
  });

  it("accepts a hybrid into mine, arena, and pond", () => {
    state.ducks.push({ defId: "duckTree", level: 1, shards: 0, nextHitIn: 1 }); // hybrid
    expect(assignToRoster(state, "mine", 0, "duckTree")).toBe(true);
    expect(assignToRoster(state, "arena", 0, "duckTree")).toBe(true);
    expect(assignToRoster(state, "pond", 0, "duckTree")).toBe(true);
    expect(state.rosters.pond).toContain("duckTree");
  });

  it("accepts a miner into the mine and a fighter into the arena", () => {
    expect(assignToRoster(state, "mine", 0, "bill")).toBe(true); // bill already in mine by default too
    state.ducks.push({ defId: "quackers", level: 1, shards: 0, nextHitIn: 1 });
    expect(assignToRoster(state, "arena", 0, "quackers")).toBe(true);
  });
});

// PLAN2.md §4 Phase B: pond auras fold into computeStats globally while
// their duck sits in state.rosters.pond.
describe("pond aura folding in computeStats", () => {
  it("folds a combat aura into attackDamageMult and defenseMult", () => {
    const combatAuraDuck = DUCK_DEFS.find((d) => d.pondAura?.kind === "combat");
    expect(combatAuraDuck).toBeDefined();
    state.ducks.push({ defId: combatAuraDuck!.id, level: 1, shards: 0, nextHitIn: 1 });
    assignToRoster(state, "pond", 0, combatAuraDuck!.id);
    const stats = refreshStats(state, 0);
    const power = combatAuraDuck!.pondAura!.power;
    expect(stats.attackDamageMult).toBeCloseTo(1 + power, 5);
    expect(stats.defenseMult).toBeCloseTo(1 + power, 5);
    expect(stats.goldMult).toBeCloseTo(1, 5);
    expect(stats.xpMult).toBeCloseTo(1, 5);
  });

  it("folds an economy aura into goldMult and xpMult", () => {
    // Puddle is the hand-curated pond economy duck (PLAN2.md §4 Phase B).
    state.ducks.push({ defId: "puddle", level: 1, shards: 0, nextHitIn: 1 });
    assignToRoster(state, "pond", 0, "puddle");
    const stats = refreshStats(state, 0);
    const power = DUCK_DEFS.find((d) => d.id === "puddle")!.pondAura!.power;
    expect(stats.goldMult).toBeCloseTo(1 + power, 5);
    expect(stats.xpMult).toBeCloseTo(1 + power, 5);
    expect(stats.attackDamageMult).toBeCloseTo(1, 5);
    expect(stats.defenseMult).toBeCloseTo(1, 5);
  });

  it("does not apply the aura when the duck isn't in the pond roster", () => {
    const stats = refreshStats(state, 0); // fresh state, puddle not owned/rostered
    expect(stats.goldMult).toBeCloseTo(1, 5);
    expect(stats.attackDamageMult).toBeCloseTo(1, 5);
  });
});
