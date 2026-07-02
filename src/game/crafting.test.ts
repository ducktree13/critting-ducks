import { beforeEach, describe, expect, it } from "vitest";
import { canCraft, craftItem, getRecipe, RECIPES } from "./crafting";
import { createInitialState } from "./state";
import type { GameState, Rng } from "./types";

const rng: Rng = { next: () => 0.5 };

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("canCraft", () => {
  it("is false without enough ore or materials", () => {
    expect(canCraft(state, "weaponBasic")).toBe(false);
  });

  it("is true once ore and materials are met", () => {
    state.ores.copper = 50;
    state.materials.slimeGoo = 3;
    expect(canCraft(state, "weaponBasic")).toBe(true);
  });

  it("is false below the recipe's level gate even if resources are met", () => {
    state.ores.silver = 100;
    state.ores.crystal = 20;
    state.materials.gooseFeather = 5;
    state.materials.golemCrumb = 3;
    expect(canCraft(state, "weaponAdvanced")).toBe(false); // needs level 10
    state.level = 10;
    expect(canCraft(state, "weaponAdvanced")).toBe(true);
  });
});

describe("craftItem", () => {
  it("returns null and spends nothing when requirements aren't met", () => {
    const before = state.ores.copper;
    expect(craftItem(state, rng, "weaponBasic")).toBeNull();
    expect(state.ores.copper).toBe(before);
  });

  it("spends ore and materials and adds an unequipped item", () => {
    state.ores.copper = 50;
    state.materials.slimeGoo = 3;
    const item = craftItem(state, rng, "weaponBasic");
    expect(item).not.toBeNull();
    expect(state.ores.copper).toBe(0);
    expect(state.materials.slimeGoo).toBe(0);
    expect(state.equipment).toContain(item);
    expect(item!.equippedBy).toBeNull();
    expect(item!.slot).toBe("weapon");
  });

  it("only spends the exact recipe cost, not more", () => {
    state.ores.copper = 200;
    state.materials.slimeGoo = 10;
    craftItem(state, rng, "armorBasic");
    expect(state.ores.copper).toBe(150);
    expect(state.materials.slimeGoo).toBe(7);
  });

  it("every recipe id is unique and resolvable", () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getRecipe(id).id).toBe(id);
  });
});
