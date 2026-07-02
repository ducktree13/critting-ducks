import { BOSS_MATERIAL, GEAR, MATERIAL_BY_WAVE_INDEX, RARITY_ORDER } from "./balance";
import { emit } from "./events";
import type { EquipSlot, EquipmentItem, GameState, MaterialId, Rarity, Rng } from "./types";

const SLOT_NAMES: Record<EquipSlot, readonly string[]> = {
  weapon: ["Dagger", "Cutlass", "Spear", "Hammer"],
  armor: ["Vest", "Breastplate", "Cloak", "Shell"],
  charm: ["Amulet", "Ring", "Talisman", "Medallion"],
};

const RARITY_ADJECTIVE: Record<Rarity, string> = {
  common: "Worn",
  uncommon: "Sturdy",
  rare: "Fine",
  epic: "Masterwork",
  legendary: "Legendary",
  mythic: "Mythic",
  divine: "Divine",
};

const SLOTS: EquipSlot[] = ["weapon", "armor", "charm"];

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.min(Math.floor(rng.next() * arr.length), arr.length - 1)];
}

function rollDropRarity(rng: Rng): Rarity {
  const roll = rng.next();
  let cumulative = 0;
  for (const rarity of RARITY_ORDER) {
    cumulative += GEAR.dropRarityOdds[rarity];
    if (roll < cumulative) return rarity;
  }
  return "divine";
}

let nextItemId = 1;

export function buildEquipment(rng: Rng, slot: EquipSlot, rarity: Rarity): EquipmentItem {
  const budget = GEAR.statBudget[rarity];
  const base = pick(rng, SLOT_NAMES[slot]);
  const name = `${RARITY_ADJECTIVE[rarity]} ${base}`;

  const stats =
    slot === "weapon"
      ? { flatAttack: Math.round(budget * 0.5 * 100) / 100, attackMult: Math.round((1 + budget * 0.015) * 1000) / 1000 }
      : slot === "armor"
        ? { flatDefense: Math.round(budget * 0.3 * 100) / 100, hpMult: Math.round((1 + budget * 0.012) * 1000) / 1000 }
        : { critChanceBonus: Math.round(budget * 0.003 * 1000) / 1000, goldMult: Math.round((1 + budget * 0.008) * 1000) / 1000 };

  return { id: `eq${nextItemId++}`, kindId: base, slot, rarity, name, stats, equippedBy: null };
}

// Enemy-kill material drop: guaranteed on boss waves, chance otherwise,
// themed to the enemy family cycling with the wave (matches arena.ts's
// enemy name cycle).
export function rollMaterialDrop(state: GameState, rng: Rng, wave: number, boss: boolean): MaterialId | null {
  if (boss) {
    state.materials[BOSS_MATERIAL] += 1;
    emit("materialDrop", { material: BOSS_MATERIAL });
    return BOSS_MATERIAL;
  }
  if (rng.next() >= GEAR.materialDropChance) return null;
  const material = MATERIAL_BY_WAVE_INDEX[(wave - 1) % MATERIAL_BY_WAVE_INDEX.length];
  state.materials[material] += 1;
  emit("materialDrop", { material });
  return material;
}

// Enemy-kill equipment drop: low chance, higher on boss waves.
export function rollEquipmentDrop(state: GameState, rng: Rng, boss: boolean): EquipmentItem | null {
  const chance = boss ? GEAR.equipmentBossDropChance : GEAR.equipmentDropChance;
  if (rng.next() >= chance) return null;
  const slot = pick(rng, SLOTS);
  const rarity = rollDropRarity(rng);
  const item = buildEquipment(rng, slot, rarity);
  state.equipment.push(item);
  emit("equipmentDrop", { item });
  return item;
}

export function equippedItemsFor(state: GameState, defId: string): Partial<Record<EquipSlot, EquipmentItem>> {
  const result: Partial<Record<EquipSlot, EquipmentItem>> = {};
  for (const item of state.equipment) {
    if (item.equippedBy === defId) result[item.slot] = item;
  }
  return result;
}

// Equips an item on a duck, swapping out whatever was in that slot (for
// that duck) and pulling the item away from any other duck that had it.
export function equipItem(state: GameState, defId: string, itemId: string): boolean {
  const item = state.equipment.find((e) => e.id === itemId);
  if (!item) return false;
  for (const other of state.equipment) {
    if (other.equippedBy === defId && other.slot === item.slot) other.equippedBy = null;
  }
  item.equippedBy = defId;
  return true;
}

export function unequipItem(state: GameState, itemId: string): boolean {
  const item = state.equipment.find((e) => e.id === itemId);
  if (!item) return false;
  item.equippedBy = null;
  return true;
}

// Only unequipped items can be sold — protects against silently depowering
// a rostered duck.
export function sellEquipment(state: GameState, itemId: string): boolean {
  const item = state.equipment.find((e) => e.id === itemId);
  if (!item || item.equippedBy !== null) return false;
  state.equipment = state.equipment.filter((e) => e.id !== itemId);
  const gold = GEAR.sellPrice[item.rarity];
  state.gold += gold;
  state.lifetime.gold += gold;
  return true;
}
