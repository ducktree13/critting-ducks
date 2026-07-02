import { emit } from "./events";
import type { GameState, SkillNode } from "./types";

// All skill nodes (PLAN.md §4). Costs in gold; `requires` is the parent tree
// edge; `minLevel` gates by player level. {x, y} live in the tree panel's
// 0 0 400 600 viewBox, root at the bottom.
export const SKILL_NODES: readonly SkillNode[] = [
  // Trunk
  { id: "crit1", name: "Keen Eyes", desc: "+5% crit chance", cost: 30, minLevel: 1, branch: "trunk", x: 200, y: 540, effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "speed1", name: "Quick Feathers", desc: "+10% attack speed (both panels)", cost: 60, requires: "crit1", minLevel: 1, branch: "trunk", x: 200, y: 470, effect: { kind: "stat", stat: "attackSpeedMult", mult: 1.1 } },
  { id: "crit2", name: "Keener Eyes", desc: "+5% crit chance", cost: 150, requires: "speed1", minLevel: 2, branch: "trunk", x: 200, y: 400, effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  // Left branch — mining
  { id: "ore1", name: "Bigger Pickaxes", desc: "+0.1 ore per hit", cost: 50, requires: "speed1", minLevel: 1, branch: "left", x: 140, y: 450, effect: { kind: "stat", stat: "orePerHit", add: 0.1 } },
  { id: "ore2", name: "Ore Magnet", desc: "+0.2 ore per hit", cost: 200, requires: "ore1", minLevel: 2, branch: "left", x: 90, y: 420, effect: { kind: "stat", stat: "orePerHit", add: 0.2 } },
  { id: "mineslot2", name: "Bunk Beds", desc: "+1 mine roster slot", cost: 350, requires: "ore1", minLevel: 3, branch: "left", x: 125, y: 385, effect: { kind: "slot", panel: "mine" } },
  { id: "oresilver", name: "Silver Vein", desc: "Unlock Silver ore (3g/ore)", cost: 550, requires: "ore2", minLevel: 3, branch: "left", x: 50, y: 380, effect: { kind: "oreUnlock", ore: "silver" } },
  { id: "minespeed", name: "Frenzied Mining", desc: "+25% mine attack speed", cost: 2000, requires: "ore2", minLevel: 5, branch: "left", x: 90, y: 348, effect: { kind: "stat", stat: "mineSpeedMult", mult: 1.25 } },
  { id: "ore3", name: "Deep Drilling", desc: "+50% ore per hit", cost: 1000, requires: "oresilver", minLevel: 5, branch: "left", x: 40, y: 330, effect: { kind: "stat", stat: "oreMult", mult: 1.5 } },
  { id: "offline1", name: "Night Shift", desc: "Offline rate 50% → 65%", cost: 1600, requires: "mineslot2", minLevel: 5, branch: "left", x: 115, y: 312, effect: { kind: "offline", rate: 0.65 } },
  { id: "orecrystal", name: "Crystal Cavern", desc: "Unlock Crystal ore (8g/ore)", cost: 2600, requires: "ore3", minLevel: 7, branch: "left", x: 42, y: 268, effect: { kind: "oreUnlock", ore: "crystal" } },
  { id: "mineslot3", name: "Duck Dormitory", desc: "+1 mine roster slot (3 total)", cost: 3800, requires: "offline1", minLevel: 8, branch: "left", x: 135, y: 268, effect: { kind: "slot", panel: "mine" } },
  { id: "offline2", name: "Automated Carts", desc: "Offline rate 65% → 80%", cost: 6000, requires: "offline1", minLevel: 10, branch: "left", x: 88, y: 265, effect: { kind: "offline", rate: 0.8 } },
  { id: "orestar", name: "Starmetal Seam", desc: "Unlock Starmetal ore (20g/ore)", cost: 9000, requires: "orecrystal", minLevel: 12, branch: "left", x: 40, y: 218, effect: { kind: "oreUnlock", ore: "starmetal" } },
  // Right branch — combat
  { id: "atk1", name: "Sharp Beak", desc: "+1 attack damage", cost: 50, requires: "speed1", minLevel: 1, branch: "right", x: 260, y: 450, effect: { kind: "stat", stat: "flatAttack", add: 1 } },
  { id: "def1", name: "Feather Armor", desc: "+1 defense", cost: 100, requires: "atk1", minLevel: 2, branch: "right", x: 310, y: 420, effect: { kind: "stat", stat: "flatDefense", add: 1 } },
  { id: "arenaslot2", name: "Battle Buddy", desc: "+1 arena roster slot", cost: 350, requires: "atk1", minLevel: 3, branch: "right", x: 250, y: 385, effect: { kind: "slot", panel: "arena" } },
  { id: "atk2", name: "Talon Training", desc: "+25% attack damage", cost: 400, requires: "def1", minLevel: 3, branch: "right", x: 355, y: 385, effect: { kind: "stat", stat: "attackDamageMult", mult: 1.25 } },
  { id: "atkspeed1", name: "Wing Flurry", desc: "+25% arena attack speed", cost: 800, requires: "atk2", minLevel: 5, branch: "right", x: 360, y: 320, effect: { kind: "stat", stat: "arenaSpeedMult", mult: 1.25 } },
  { id: "def2", name: "Iron Plumage", desc: "+50% defense", cost: 1300, requires: "def1", minLevel: 5, branch: "right", x: 300, y: 348, effect: { kind: "stat", stat: "defenseMult", mult: 1.5 } },
  { id: "atk3", name: "Berserk Quack", desc: "+50% attack damage", cost: 3200, requires: "atkspeed1", minLevel: 8, branch: "right", x: 360, y: 255, effect: { kind: "stat", stat: "attackDamageMult", mult: 1.5 } },
  { id: "arenaslot3", name: "Flying V", desc: "+1 arena roster slot (3 total)", cost: 3800, requires: "arenaslot2", minLevel: 8, branch: "right", x: 255, y: 315, effect: { kind: "slot", panel: "arena" } },
  // Crown — crit core
  { id: "critdmg1", name: "Heavy Blows", desc: "Crit damage +0.25x", cost: 250, requires: "crit2", minLevel: 3, branch: "crown", x: 180, y: 335, effect: { kind: "stat", stat: "critMult", add: 0.25 } },
  { id: "xp1", name: "Wise Elders", desc: "+25% XP gain", cost: 900, requires: "crit2", minLevel: 4, branch: "crown", x: 235, y: 340, effect: { kind: "stat", stat: "xpMult", mult: 1.25 } },
  { id: "crit3", name: "Eagle Eyes", desc: "+10% crit chance", cost: 650, requires: "critdmg1", minLevel: 5, branch: "crown", x: 185, y: 265, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "critdmg2", name: "Devastating Strikes", desc: "Crit damage +0.25x", cost: 1600, requires: "crit3", minLevel: 7, branch: "crown", x: 210, y: 205, effect: { kind: "stat", stat: "critMult", add: 0.25 } },
  { id: "crit4", name: "Precision Instinct", desc: "+10% crit chance", cost: 3200, requires: "critdmg2", minLevel: 9, branch: "crown", x: 225, y: 150, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "critdmg3", name: "Overkill", desc: "Crit damage +0.5x", cost: 5000, requires: "crit4", minLevel: 11, branch: "crown", x: 185, y: 100, effect: { kind: "stat", stat: "critMult", add: 0.5 } },
  { id: "crit5", name: "Guaranteed Chaos", desc: "+10% crit chance", cost: 12000, requires: "crit4", minLevel: 14, branch: "crown", x: 258, y: 95, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "streak1", name: "Momentum", desc: "Streak tier buffs last 15s", cost: 7500, requires: "crit3", minLevel: 10, branch: "crown", x: 145, y: 208, effect: { kind: "buffDuration", seconds: 15 } },
];

const byId = new Map(SKILL_NODES.map((n) => [n.id, n]));

export function getSkillNode(id: string): SkillNode {
  const node = byId.get(id);
  if (!node) throw new Error(`Unknown skill node: ${id}`);
  return node;
}

export function isOwned(state: GameState, id: string): boolean {
  return state.skillNodes.includes(id);
}

// Visible once the parent is purchased (roots always).
export function isVisible(state: GameState, id: string): boolean {
  const node = getSkillNode(id);
  return !node.requires || isOwned(state, node.requires);
}

export function canBuy(state: GameState, id: string): boolean {
  const node = getSkillNode(id);
  return (
    !isOwned(state, id) &&
    isVisible(state, id) &&
    state.level >= node.minLevel &&
    state.gold >= node.cost
  );
}

export function buy(state: GameState, id: string): boolean {
  if (!canBuy(state, id)) return false;
  state.gold -= getSkillNode(id).cost;
  state.skillNodes.push(id);
  emit("buy", { nodeId: id });
  return true;
}
