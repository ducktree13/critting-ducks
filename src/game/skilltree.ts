import { emit } from "./events";
import type { Act2TreeId, GameState, SkillNode } from "./types";

// Act 1 (PLAN.md §4). Costs in gold; `requires` is the parent tree edge;
// `minLevel` gates by player level. {x, y} live in the tree panel's
// 0 0 400 600 viewBox, root at the bottom.
const ACT1_NODES: readonly SkillNode[] = [
  // Trunk
  { id: "crit1", name: "Keen Eyes", desc: "+5% crit chance", cost: 30, minLevel: 1, branch: "trunk", treeId: "act1", x: 200, y: 540, effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "speed1", name: "Quick Feathers", desc: "+10% attack speed (both panels)", cost: 60, requires: "crit1", minLevel: 1, branch: "trunk", treeId: "act1", x: 200, y: 470, effect: { kind: "stat", stat: "attackSpeedMult", mult: 1.1 } },
  { id: "crit2", name: "Keener Eyes", desc: "+5% crit chance", cost: 150, requires: "speed1", minLevel: 2, branch: "trunk", treeId: "act1", x: 200, y: 400, effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  // Left branch — mining
  { id: "ore1", name: "Bigger Pickaxes", desc: "+0.1 ore per hit", cost: 50, requires: "speed1", minLevel: 1, branch: "left", treeId: "act1", x: 140, y: 450, effect: { kind: "stat", stat: "orePerHit", add: 0.1 } },
  { id: "ore2", name: "Ore Magnet", desc: "+0.2 ore per hit", cost: 200, requires: "ore1", minLevel: 2, branch: "left", treeId: "act1", x: 90, y: 420, effect: { kind: "stat", stat: "orePerHit", add: 0.2 } },
  { id: "mineslot2", name: "Bunk Beds", desc: "+1 mine roster slot", cost: 350, requires: "ore1", minLevel: 3, branch: "left", treeId: "act1", x: 125, y: 385, effect: { kind: "slot", panel: "mine" } },
  { id: "oresilver", name: "Silver Vein", desc: "Unlock Silver ore (3g/ore)", cost: 550, requires: "ore2", minLevel: 3, branch: "left", treeId: "act1", x: 50, y: 380, effect: { kind: "oreUnlock", ore: "silver" } },
  { id: "minespeed", name: "Frenzied Mining", desc: "+25% mine attack speed", cost: 2000, requires: "ore2", minLevel: 5, branch: "left", treeId: "act1", x: 90, y: 348, effect: { kind: "stat", stat: "mineSpeedMult", mult: 1.25 } },
  { id: "ore3", name: "Deep Drilling", desc: "+50% ore per hit", cost: 1000, requires: "oresilver", minLevel: 5, branch: "left", treeId: "act1", x: 40, y: 330, effect: { kind: "stat", stat: "oreMult", mult: 1.5 } },
  { id: "offline1", name: "Night Shift", desc: "Offline rate 50% → 65%", cost: 1600, requires: "mineslot2", minLevel: 5, branch: "left", treeId: "act1", x: 115, y: 312, effect: { kind: "offline", rate: 0.65 } },
  { id: "orecrystal", name: "Crystal Cavern", desc: "Unlock Crystal ore (8g/ore)", cost: 2600, requires: "ore3", minLevel: 7, branch: "left", treeId: "act1", x: 42, y: 268, effect: { kind: "oreUnlock", ore: "crystal" } },
  { id: "mineslot3", name: "Duck Dormitory", desc: "+1 mine roster slot (3 total)", cost: 3800, requires: "offline1", minLevel: 8, branch: "left", treeId: "act1", x: 135, y: 268, effect: { kind: "slot", panel: "mine" } },
  { id: "offline2", name: "Automated Carts", desc: "Offline rate 65% → 80%", cost: 6000, requires: "offline1", minLevel: 10, branch: "left", treeId: "act1", x: 88, y: 265, effect: { kind: "offline", rate: 0.8 } },
  { id: "orestar", name: "Starmetal Seam", desc: "Unlock Starmetal ore (20g/ore)", cost: 9000, requires: "orecrystal", minLevel: 12, branch: "left", treeId: "act1", x: 40, y: 218, effect: { kind: "oreUnlock", ore: "starmetal" } },
  // Right branch — combat
  { id: "atk1", name: "Sharp Beak", desc: "+1 attack damage", cost: 50, requires: "speed1", minLevel: 1, branch: "right", treeId: "act1", x: 260, y: 450, effect: { kind: "stat", stat: "flatAttack", add: 1 } },
  { id: "def1", name: "Feather Armor", desc: "+1 defense", cost: 100, requires: "atk1", minLevel: 2, branch: "right", treeId: "act1", x: 310, y: 420, effect: { kind: "stat", stat: "flatDefense", add: 1 } },
  { id: "arenaslot2", name: "Battle Buddy", desc: "+1 arena roster slot", cost: 350, requires: "atk1", minLevel: 3, branch: "right", treeId: "act1", x: 250, y: 385, effect: { kind: "slot", panel: "arena" } },
  { id: "atk2", name: "Talon Training", desc: "+25% attack damage", cost: 400, requires: "def1", minLevel: 3, branch: "right", treeId: "act1", x: 355, y: 385, effect: { kind: "stat", stat: "attackDamageMult", mult: 1.25 } },
  { id: "atkspeed1", name: "Wing Flurry", desc: "+25% arena attack speed", cost: 800, requires: "atk2", minLevel: 5, branch: "right", treeId: "act1", x: 360, y: 320, effect: { kind: "stat", stat: "arenaSpeedMult", mult: 1.25 } },
  { id: "def2", name: "Iron Plumage", desc: "+50% defense", cost: 1300, requires: "def1", minLevel: 5, branch: "right", treeId: "act1", x: 300, y: 348, effect: { kind: "stat", stat: "defenseMult", mult: 1.5 } },
  { id: "atk3", name: "Berserk Quack", desc: "+50% attack damage", cost: 3200, requires: "atkspeed1", minLevel: 8, branch: "right", treeId: "act1", x: 360, y: 255, effect: { kind: "stat", stat: "attackDamageMult", mult: 1.5 } },
  { id: "arenaslot3", name: "Flying V", desc: "+1 arena roster slot (3 total)", cost: 3800, requires: "arenaslot2", minLevel: 8, branch: "right", treeId: "act1", x: 255, y: 315, effect: { kind: "slot", panel: "arena" } },
  // Crown — crit core
  { id: "critdmg1", name: "Heavy Blows", desc: "Crit damage +0.25x", cost: 250, requires: "crit2", minLevel: 3, branch: "crown", treeId: "act1", x: 180, y: 335, effect: { kind: "stat", stat: "critMult", add: 0.25 } },
  { id: "xp1", name: "Wise Elders", desc: "+25% XP gain", cost: 900, requires: "crit2", minLevel: 4, branch: "crown", treeId: "act1", x: 235, y: 340, effect: { kind: "stat", stat: "xpMult", mult: 1.25 } },
  { id: "crit3", name: "Eagle Eyes", desc: "+10% crit chance", cost: 650, requires: "critdmg1", minLevel: 5, branch: "crown", treeId: "act1", x: 185, y: 265, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "critdmg2", name: "Devastating Strikes", desc: "Crit damage +0.25x", cost: 1600, requires: "crit3", minLevel: 7, branch: "crown", treeId: "act1", x: 210, y: 205, effect: { kind: "stat", stat: "critMult", add: 0.25 } },
  { id: "crit4", name: "Precision Instinct", desc: "+10% crit chance", cost: 3200, requires: "critdmg2", minLevel: 9, branch: "crown", treeId: "act1", x: 225, y: 150, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "critdmg3", name: "Overkill", desc: "Crit damage +0.5x", cost: 5000, requires: "crit4", minLevel: 11, branch: "crown", treeId: "act1", x: 185, y: 100, effect: { kind: "stat", stat: "critMult", add: 0.5 } },
  { id: "crit5", name: "Guaranteed Chaos", desc: "+10% crit chance", cost: 12000, requires: "crit4", minLevel: 14, branch: "crown", treeId: "act1", x: 258, y: 95, effect: { kind: "stat", stat: "critChance", add: 0.1 } },
  { id: "streak1", name: "Momentum", desc: "Streak tier buffs last 15s", cost: 7500, requires: "crit3", minLevel: 10, branch: "crown", treeId: "act1", x: 145, y: 208, effect: { kind: "buffDuration", seconds: 15 } },
];

// Act 2 (PLAN2.md §9): unlocked once every Act 1 node is owned. Four
// single-chain trees; each step's cost/level roughly doubles, spanning
// 50K→7M gold and levels 15→51 — a genuine month-plus of endgame progress.
const ACT2_COSTS = [50_000, 75_000, 120_000, 180_000, 270_000, 400_000, 600_000, 900_000, 1_300_000, 1_900_000, 2_700_000, 3_800_000, 5_000_000, 7_000_000];
const ACT2_LEVELS = [15, 17, 19, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51];

// Extra costs/levels for the two branch-off pack-crit nodes each of
// crit2/passive2 grows (16 nodes total per tree — the seating cap). Priced
// in line with their neighboring chain nodes.
const PACK_CRIT_BRANCH = [
  { cost: 800_000, minLevel: 28 },
  { cost: 2_100_000, minLevel: 40 },
] as const;

// Each Act-2 tree renders in its own independent 400x600 viewBox, so every
// chain is centered on the same x — a single column growing upward.
function act2Chain(
  treeId: Act2TreeId,
  steps: readonly Omit<SkillNode, "cost" | "minLevel" | "requires" | "branch" | "treeId" | "x" | "y">[],
): SkillNode[] {
  return steps.map((step, i) => ({
    ...step,
    cost: ACT2_COSTS[i],
    minLevel: ACT2_LEVELS[i],
    requires: i === 0 ? undefined : steps[i - 1].id,
    branch: "trunk",
    treeId,
    x: 200,
    y: 560 - i * 38,
  }));
}

const MINING2_NODES = act2Chain("mining2", [
  { id: "m2_oreboost1", name: "Refined Picks", desc: "+0.3 ore per hit", effect: { kind: "stat", stat: "orePerHit", add: 0.3 } },
  { id: "m2_speedboost1", name: "Turbo Drills", desc: "+25% mine speed", effect: { kind: "stat", stat: "mineSpeedMult", mult: 1.25 } },
  { id: "m2_slot4", name: "Mine Wing", desc: "+1 mine roster slot (4 total)", effect: { kind: "slot", panel: "mine" } },
  { id: "m2_orevoid", name: "Void Fissure", desc: "Unlock Voidstone ore (60g/ore)", effect: { kind: "oreUnlock", ore: "voidstone" } },
  { id: "m2_oreboost2", name: "Master Excavation", desc: "+50% ore per hit", effect: { kind: "stat", stat: "oreMult", mult: 1.5 } },
  { id: "m2_offline3", name: "Automated Fleet", desc: "Offline rate 80% → 90%", effect: { kind: "offline", rate: 0.9 } },
  { id: "m2_slot5", name: "Mine Wing II", desc: "+1 mine roster slot (5 total)", effect: { kind: "slot", panel: "mine" } },
  { id: "m2_oreaurorium", name: "Aurorium Heart", desc: "Unlock Aurorium ore (150g/ore)", effect: { kind: "oreUnlock", ore: "aurorium" } },
  { id: "m2_speedboost2", name: "Hyperdrills", desc: "+25% mine speed", effect: { kind: "stat", stat: "mineSpeedMult", mult: 1.25 } },
  { id: "m2_oreboost3", name: "Deep Core Mining", desc: "+1 ore per hit", effect: { kind: "stat", stat: "orePerHit", add: 1 } },
  { id: "m2_offline4", name: "Full Automation", desc: "Offline rate 90% → 95%", effect: { kind: "offline", rate: 0.95 } },
  { id: "m2_oreboost4", name: "Starforged Tools", desc: "+100% ore per hit", effect: { kind: "stat", stat: "oreMult", mult: 2 } },
  { id: "m2_slot6", name: "Mine Wing III", desc: "+1 mine roster slot (6 total)", effect: { kind: "slot", panel: "mine" } },
  { id: "m2_capstone", name: "Endless Vein", desc: "+50% ore per hit", effect: { kind: "stat", stat: "oreMult", mult: 1.5 } },
]);

const COMBAT2_NODES = act2Chain("combat2", [
  { id: "c2_atk1", name: "Honed Talons", desc: "+3 attack damage", effect: { kind: "stat", stat: "flatAttack", add: 3 } },
  { id: "c2_atkspeed2", name: "War Drums", desc: "+25% arena attack speed", effect: { kind: "stat", stat: "arenaSpeedMult", mult: 1.25 } },
  { id: "c2_slot4", name: "Battle Wing", desc: "+1 arena roster slot (4 total)", effect: { kind: "slot", panel: "arena" } },
  { id: "c2_def3", name: "Reinforced Plumage", desc: "+50% defense", effect: { kind: "stat", stat: "defenseMult", mult: 1.5 } },
  { id: "c2_atk2", name: "Berserker's Fury", desc: "+75% attack damage", effect: { kind: "stat", stat: "attackDamageMult", mult: 1.75 } },
  { id: "c2_slot5", name: "Battle Wing II", desc: "+1 arena roster slot (5 total)", effect: { kind: "slot", panel: "arena" } },
  { id: "c2_atkspeed3", name: "Lightning Reflexes", desc: "+25% arena attack speed", effect: { kind: "stat", stat: "arenaSpeedMult", mult: 1.25 } },
  { id: "c2_def4", name: "Adamant Shell", desc: "+5 defense", effect: { kind: "stat", stat: "flatDefense", add: 5 } },
  { id: "c2_atk3", name: "Titan Slayer", desc: "+100% attack damage", effect: { kind: "stat", stat: "attackDamageMult", mult: 2 } },
  { id: "c2_slot6", name: "Battle Wing III", desc: "+1 arena roster slot (6 total)", effect: { kind: "slot", panel: "arena" } },
  { id: "c2_def5", name: "Fortress Form", desc: "+75% defense", effect: { kind: "stat", stat: "defenseMult", mult: 1.75 } },
  { id: "c2_atk4", name: "Apex Predator", desc: "+10 attack damage", effect: { kind: "stat", stat: "flatAttack", add: 10 } },
  { id: "c2_atkspeed4", name: "Blitz Protocol", desc: "+50% arena attack speed", effect: { kind: "stat", stat: "arenaSpeedMult", mult: 1.5 } },
  { id: "c2_capstone", name: "Warlord's Ascendance", desc: "+100% attack damage", effect: { kind: "stat", stat: "attackDamageMult", mult: 2 } },
]);

const CRIT2_NODES = act2Chain("crit2", [
  { id: "x2_crit6", name: "Hawk Vision", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_critdmg4", name: "Piercing Strikes", desc: "Crit damage +0.5x", effect: { kind: "stat", stat: "critMult", add: 0.5 } },
  { id: "x2_crit7", name: "True Sight", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_streak2", name: "Momentum II", desc: "Streak tier buffs last 20s", effect: { kind: "buffDuration", seconds: 20 } },
  { id: "x2_critdmg5", name: "Executioner", desc: "Crit damage +0.75x", effect: { kind: "stat", stat: "critMult", add: 0.75 } },
  { id: "x2_crit8", name: "Omniscience", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_critdmg6", name: "Overwhelming Force", desc: "Crit damage +1.0x", effect: { kind: "stat", stat: "critMult", add: 1.0 } },
  { id: "x2_crit9", name: "Fate's Favor", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_streak3", name: "Momentum III", desc: "Streak tier buffs last 30s", effect: { kind: "buffDuration", seconds: 30 } },
  { id: "x2_critdmg7", name: "Annihilation", desc: "Crit damage +1.5x", effect: { kind: "stat", stat: "critMult", add: 1.5 } },
  { id: "x2_crit10", name: "Perfect Clarity", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_critdmg8", name: "Devastation", desc: "Crit damage +2.0x", effect: { kind: "stat", stat: "critMult", add: 2.0 } },
  { id: "x2_crit11", name: "Absolute Precision", desc: "+5% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.05 } },
  { id: "x2_capstone", name: "Critical Singularity", desc: "+10% crit chance", effect: { kind: "stat", stat: "critChance", add: 0.1 } },
]);

// Two pack-crit branch nodes per tree (crit2 + passive2), each hung off an
// existing chain leaf so every tree still seats at exactly 16 nodes (14
// chain + 2 branch = the Act-2 procedural-tree anchor cap, treePanel.ts).
function packCritBranch(
  treeId: Act2TreeId,
  requiresId: string,
  steps: readonly { id: string; name: string; desc: string; add: number }[],
): SkillNode[] {
  return steps.map((step, i) => ({
    id: step.id,
    name: step.name,
    desc: step.desc,
    cost: PACK_CRIT_BRANCH[i].cost,
    minLevel: PACK_CRIT_BRANCH[i].minLevel,
    requires: i === 0 ? requiresId : steps[i - 1].id,
    branch: "trunk",
    treeId,
    x: 260,
    y: 400 - i * 38,
    effect: { kind: "packCrit", add: step.add },
  }));
}

const CRIT2_PACKCRIT_NODES = packCritBranch("crit2", "x2_critdmg5", [
  { id: "x2_luckywrapping", name: "Lucky Wrapping", desc: "+2% pack crit chance", add: 0.02 },
  { id: "x2_goldenseams", name: "Golden Seams", desc: "+3% pack crit chance", add: 0.03 },
]);

const PASSIVE2_NODES = act2Chain("passive2", [
  { id: "p2_gold1", name: "Efficient Trade", desc: "+15% gold", effect: { kind: "stat", stat: "goldMult", mult: 1.15 } },
  { id: "p2_xp1", name: "Ancient Wisdom", desc: "+15% XP", effect: { kind: "stat", stat: "xpMult", mult: 1.15 } },
  { id: "p2_offline5", name: "Autonomous Systems", desc: "Offline rate 95% → 97%", effect: { kind: "offline", rate: 0.97 } },
  { id: "p2_gold2", name: "Market Mastery", desc: "+20% gold", effect: { kind: "stat", stat: "goldMult", mult: 1.2 } },
  { id: "p2_xp2", name: "Enlightened Mind", desc: "+20% XP", effect: { kind: "stat", stat: "xpMult", mult: 1.2 } },
  { id: "p2_gold3", name: "Grand Exchange", desc: "+30% gold", effect: { kind: "stat", stat: "goldMult", mult: 1.3 } },
  { id: "p2_pondslot1", name: "Wider Banks", desc: "+1 pond roster slot", effect: { kind: "slot", panel: "pond" } },
  { id: "p2_offline6", name: "Perpetual Motion", desc: "Offline rate 97% → 99%", effect: { kind: "offline", rate: 0.99 } },
  { id: "p2_gold4", name: "Golden Empire", desc: "+50% gold", effect: { kind: "stat", stat: "goldMult", mult: 1.5 } },
  { id: "p2_xp4", name: "Transcendent Insight", desc: "+50% XP", effect: { kind: "stat", stat: "xpMult", mult: 1.5 } },
  { id: "p2_pondslot2", name: "Sprawling Reeds", desc: "+1 pond roster slot", effect: { kind: "slot", panel: "pond" } },
  { id: "p2_gold5", name: "Infinite Wealth", desc: "+75% gold", effect: { kind: "stat", stat: "goldMult", mult: 1.75 } },
  { id: "p2_xp5", name: "Omniscient Awareness", desc: "+75% XP", effect: { kind: "stat", stat: "xpMult", mult: 1.75 } },
  { id: "p2_capstone", name: "Passive Nirvana", desc: "+100% gold and XP", effect: { kind: "stat", stat: "goldMult", mult: 2 } },
]);

const PASSIVE2_PACKCRIT_NODES = packCritBranch("passive2", "p2_gold4", [
  { id: "p2_luckycharms", name: "Lucky Charms", desc: "+2% pack crit chance", add: 0.02 },
  { id: "p2_fortunesblessing", name: "Fortune's Blessing", desc: "+3% pack crit chance", add: 0.03 },
]);

export const SKILL_NODES: readonly SkillNode[] = [
  ...ACT1_NODES,
  ...MINING2_NODES,
  ...COMBAT2_NODES,
  ...CRIT2_NODES,
  ...CRIT2_PACKCRIT_NODES,
  ...PASSIVE2_NODES,
  ...PASSIVE2_PACKCRIT_NODES,
];

export const ACT2_TREE_IDS: readonly Act2TreeId[] = ["mining2", "combat2", "crit2", "passive2"];

const byId = new Map(SKILL_NODES.map((n) => [n.id, n]));

export function getSkillNode(id: string): SkillNode {
  const node = byId.get(id);
  if (!node) throw new Error(`Unknown skill node: ${id}`);
  return node;
}

export function nodesForTree(treeId: SkillNode["treeId"]): SkillNode[] {
  return SKILL_NODES.filter((n) => n.treeId === treeId);
}

export function isAct1Complete(state: GameState): boolean {
  return nodesForTree("act1").every((n) => state.skillNodes.includes(n.id));
}

export function isOwned(state: GameState, id: string): boolean {
  return state.skillNodes.includes(id);
}

// Visible once the parent is purchased (roots always) — Act 2 trees are
// additionally gated behind clearing Act 1 entirely.
export function isVisible(state: GameState, id: string): boolean {
  const node = getSkillNode(id);
  if (node.treeId !== "act1" && !isAct1Complete(state)) return false;
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
