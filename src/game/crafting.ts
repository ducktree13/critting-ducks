import { buildEquipment } from "./gear";
import type { EquipSlot, EquipmentItem, GameState, MaterialId, OreId, Rarity, Rng } from "./types";

export interface Recipe {
  id: string;
  name: string;
  slot: EquipSlot;
  minLevel: number;
  oreCost: Partial<Record<OreId, number>>;
  materialCost: Partial<Record<MaterialId, number>>;
  rarityWeights: Partial<Record<Rarity, number>>;
}

// Three tiers per slot; higher tiers unlock by player level and roll better
// rarity, spending ore (a sink for the mine's cumulative ore counters) and
// materials farmed from the arena.
export const RECIPES: readonly Recipe[] = [
  { id: "weaponBasic", name: "Basic Weapon", slot: "weapon", minLevel: 1, oreCost: { copper: 50 }, materialCost: { slimeGoo: 3 }, rarityWeights: { common: 0.6, uncommon: 0.35, rare: 0.05 } },
  { id: "armorBasic", name: "Basic Armor", slot: "armor", minLevel: 1, oreCost: { copper: 50 }, materialCost: { slimeGoo: 3 }, rarityWeights: { common: 0.6, uncommon: 0.35, rare: 0.05 } },
  { id: "charmBasic", name: "Basic Charm", slot: "charm", minLevel: 1, oreCost: { copper: 50 }, materialCost: { slimeGoo: 3 }, rarityWeights: { common: 0.6, uncommon: 0.35, rare: 0.05 } },

  { id: "weaponAdvanced", name: "Advanced Weapon", slot: "weapon", minLevel: 10, oreCost: { silver: 100, crystal: 20 }, materialCost: { gooseFeather: 5, golemCrumb: 3 }, rarityWeights: { uncommon: 0.4, rare: 0.4, epic: 0.2 } },
  { id: "armorAdvanced", name: "Advanced Armor", slot: "armor", minLevel: 10, oreCost: { silver: 100, crystal: 20 }, materialCost: { gooseFeather: 5, golemCrumb: 3 }, rarityWeights: { uncommon: 0.4, rare: 0.4, epic: 0.2 } },
  { id: "charmAdvanced", name: "Advanced Charm", slot: "charm", minLevel: 10, oreCost: { silver: 100, crystal: 20 }, materialCost: { gooseFeather: 5, golemCrumb: 3 }, rarityWeights: { uncommon: 0.4, rare: 0.4, epic: 0.2 } },

  { id: "weaponMasterwork", name: "Masterwork Weapon", slot: "weapon", minLevel: 25, oreCost: { starmetal: 50, voidstone: 10 }, materialCost: { sharkTooth: 8, pondlordRelic: 2 }, rarityWeights: { rare: 0.3, epic: 0.5, legendary: 0.2 } },
  { id: "armorMasterwork", name: "Masterwork Armor", slot: "armor", minLevel: 25, oreCost: { starmetal: 50, voidstone: 10 }, materialCost: { sharkTooth: 8, pondlordRelic: 2 }, rarityWeights: { rare: 0.3, epic: 0.5, legendary: 0.2 } },
  { id: "charmMasterwork", name: "Masterwork Charm", slot: "charm", minLevel: 25, oreCost: { starmetal: 50, voidstone: 10 }, materialCost: { sharkTooth: 8, pondlordRelic: 2 }, rarityWeights: { rare: 0.3, epic: 0.5, legendary: 0.2 } },
];

const byId = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe {
  const r = byId.get(id);
  if (!r) throw new Error(`Unknown recipe: ${id}`);
  return r;
}

export function canCraft(state: GameState, recipeId: string): boolean {
  const recipe = getRecipe(recipeId);
  if (state.level < recipe.minLevel) return false;
  for (const [ore, cost] of Object.entries(recipe.oreCost)) {
    if (state.ores[ore as OreId] < (cost ?? 0)) return false;
  }
  for (const [material, cost] of Object.entries(recipe.materialCost)) {
    if (state.materials[material as MaterialId] < (cost ?? 0)) return false;
  }
  return true;
}

function rollWeightedRarity(rng: Rng, weights: Partial<Record<Rarity, number>>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng.next() * total;
  for (const [rarity, w] of entries) {
    roll -= w;
    if (roll <= 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

// Spends ore + materials and rolls a new equipment item. Returns null
// (spending nothing) if the recipe's level gate or costs aren't met.
export function craftItem(state: GameState, rng: Rng, recipeId: string): EquipmentItem | null {
  if (!canCraft(state, recipeId)) return null;
  const recipe = getRecipe(recipeId);

  for (const [ore, cost] of Object.entries(recipe.oreCost)) {
    state.ores[ore as OreId] -= cost ?? 0;
  }
  for (const [material, cost] of Object.entries(recipe.materialCost)) {
    state.materials[material as MaterialId] -= cost ?? 0;
  }

  const rarity = rollWeightedRarity(rng, recipe.rarityWeights);
  const item = buildEquipment(rng, recipe.slot, rarity);
  state.equipment.push(item);
  state.lifetime.gearCrafted += 1;
  return item;
}
