import { beforeEach, describe, expect, it } from "vitest";
import { attackDamageOf, defenseOf, goldMultOf, hpOf, miningPowerOf, xpMultOf } from "./ducks";
import { createInitialState, refreshStats } from "./state";
import { TRAITS } from "./traits";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
  refreshStats(state, 0);
});

describe("trait effects fold into duck stat helpers", () => {
  it("Bill (stoic) boosts defense only, leaving mining untouched", () => {
    const bill = state.ducks[0];
    expect(miningPowerOf(bill)).toBeCloseTo(0.1); // no miningMult on stoic
    expect(defenseOf(state, bill)).toBeCloseTo(0 * 1.15); // 0 base defense either way
  });

  it("a brave duck deals more damage", () => {
    const quackers = { defId: "quackers", level: 1, shards: 0, nextHitIn: 1 };
    expect(attackDamageOf(state, quackers)).toBeCloseTo(1.5 * 1.1);
  });

  it("a greedy duck earns more gold and less xp on its own hits", () => {
    const nugget = { defId: "nugget", level: 1, shards: 0, nextHitIn: 1 };
    expect(goldMultOf(state, nugget)).toBeCloseTo(1.1);
    expect(xpMultOf(nugget)).toBeCloseTo(0.95);
  });

  it("loyal boosts hp", () => {
    const puddle = { defId: "puddle", level: 1, shards: 0, nextHitIn: 1 };
    expect(hpOf(state, puddle)).toBeCloseTo(30 * 1.05);
  });

  it("equipment (removed feature, playtest X1) no longer affects attack even if present in state", () => {
    const quackers = { defId: "quackers", level: 1, shards: 0, nextHitIn: 1 };
    state.equipment.push({
      id: "eq1", kindId: "Dagger", slot: "weapon", rarity: "common",
      name: "Worn Dagger", stats: { flatAttack: 1, attackMult: 1.1 }, equippedBy: "quackers",
    });
    // Old saves may still carry equipped items, but gear no longer folds into
    // stats — only the base/level/ascension/trait math applies.
    expect(attackDamageOf(state, quackers)).toBeCloseTo(1.5 * 1.1);
  });
});

describe("TRAITS table", () => {
  it("every trait has a name, description, and effect object", () => {
    for (const trait of Object.values(TRAITS)) {
      expect(trait.name).toBeTruthy();
      expect(trait.desc).toBeTruthy();
      expect(trait.effect).toBeTypeOf("object");
    }
  });

  it("radiant boosts every self-stat dimension", () => {
    const e = TRAITS.radiant.effect;
    expect(e.miningMult).toBeGreaterThan(1);
    expect(e.attackMult).toBeGreaterThan(1);
    expect(e.attackSpeedMult).toBeGreaterThan(1);
    expect(e.defenseMult).toBeGreaterThan(1);
    expect(e.critChanceBonus).toBeGreaterThan(0);
    expect(e.xpMult).toBeGreaterThan(1);
    expect(e.goldMult).toBeGreaterThan(1);
    expect(e.hpMult).toBeGreaterThan(1);
  });
});
