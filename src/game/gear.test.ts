import { beforeEach, describe, expect, it } from "vitest";
import { GEAR } from "./balance";
import {
  buildEquipment, equipItem, equippedItemsFor, rollEquipmentDrop,
  rollMaterialDrop, sellEquipment, unequipItem,
} from "./gear";
import { createInitialState } from "./state";
import type { GameState, Rng } from "./types";

const NO_DROP: Rng = { next: () => 0.999 };
const ALWAYS_DROP: Rng = { next: () => 0 };

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("rollMaterialDrop", () => {
  it("guarantees the boss relic on boss waves", () => {
    const material = rollMaterialDrop(state, NO_DROP, 10, true);
    expect(material).toBe("pondlordRelic");
    expect(state.materials.pondlordRelic).toBe(1);
  });

  it("drops nothing below the roll threshold on normal waves", () => {
    const material = rollMaterialDrop(state, NO_DROP, 3, false);
    expect(material).toBeNull();
  });

  it("themes the material to the wave's enemy family", () => {
    const material = rollMaterialDrop(state, ALWAYS_DROP, 1, false);
    expect(material).toBe("slimeGoo");
    expect(state.materials.slimeGoo).toBe(1);
  });
});

describe("rollEquipmentDrop", () => {
  it("drops nothing below the roll threshold", () => {
    expect(rollEquipmentDrop(state, NO_DROP, false)).toBeNull();
    expect(state.equipment).toHaveLength(0);
  });

  it("adds an unequipped item to state.equipment on a hit", () => {
    const item = rollEquipmentDrop(state, ALWAYS_DROP, false);
    expect(item).not.toBeNull();
    expect(state.equipment).toHaveLength(1);
    expect(item!.equippedBy).toBeNull();
  });
});

describe("buildEquipment", () => {
  it("scales stats up with rarity", () => {
    const common = buildEquipment(ALWAYS_DROP, "weapon", "common");
    const divine = buildEquipment(ALWAYS_DROP, "weapon", "divine");
    expect(divine.stats.flatAttack!).toBeGreaterThan(common.stats.flatAttack!);
  });

  it("gives each slot its themed stat fields", () => {
    expect(buildEquipment(ALWAYS_DROP, "weapon", "rare").stats).toHaveProperty("flatAttack");
    expect(buildEquipment(ALWAYS_DROP, "armor", "rare").stats).toHaveProperty("flatDefense");
    expect(buildEquipment(ALWAYS_DROP, "charm", "rare").stats).toHaveProperty("critChanceBonus");
  });
});

describe("equip / unequip / sell", () => {
  it("equips an item and reports it via equippedItemsFor", () => {
    const item = buildEquipment(ALWAYS_DROP, "weapon", "common");
    state.equipment.push(item);
    expect(equipItem(state, "bill", item.id)).toBe(true);
    expect(equippedItemsFor(state, "bill").weapon?.id).toBe(item.id);
  });

  it("swaps out whatever was in that slot for that duck", () => {
    const a = buildEquipment(ALWAYS_DROP, "weapon", "common");
    const b = buildEquipment(ALWAYS_DROP, "weapon", "common");
    state.equipment.push(a, b);
    equipItem(state, "bill", a.id);
    equipItem(state, "bill", b.id);
    expect(equippedItemsFor(state, "bill").weapon?.id).toBe(b.id);
    expect(a.equippedBy).toBeNull();
  });

  it("moves an item to a new duck when equipped elsewhere", () => {
    const item = buildEquipment(ALWAYS_DROP, "weapon", "common");
    state.equipment.push(item);
    equipItem(state, "bill", item.id);
    equipItem(state, "quackers", item.id);
    expect(equippedItemsFor(state, "bill").weapon).toBeUndefined();
    expect(equippedItemsFor(state, "quackers").weapon?.id).toBe(item.id);
  });

  it("unequipItem clears equippedBy", () => {
    const item = buildEquipment(ALWAYS_DROP, "weapon", "common");
    state.equipment.push(item);
    equipItem(state, "bill", item.id);
    expect(unequipItem(state, item.id)).toBe(true);
    expect(item.equippedBy).toBeNull();
  });

  it("refuses to sell an equipped item", () => {
    const item = buildEquipment(ALWAYS_DROP, "weapon", "common");
    state.equipment.push(item);
    equipItem(state, "bill", item.id);
    expect(sellEquipment(state, item.id)).toBe(false);
    expect(state.equipment).toHaveLength(1);
  });

  it("sells an unequipped item for its rarity's gold price", () => {
    const item = buildEquipment(ALWAYS_DROP, "weapon", "legendary");
    state.equipment.push(item);
    const before = state.gold;
    expect(sellEquipment(state, item.id)).toBe(true);
    expect(state.gold).toBe(before + GEAR.sellPrice.legendary);
    expect(state.equipment).toHaveLength(0);
  });
});
