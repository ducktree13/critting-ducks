import { emit } from "./events";
import { ACT2_TREE_IDS, nodesForTree } from "./skilltree";
import { applyReward, getStats } from "./state";
import type { GameState, Reward } from "./types";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  metric: (state: GameState) => number;
  target: number;
  reward: Reward;
  // Hidden achievements render as "??? — Hidden achievement" (no progress
  // bar, no name/desc) in the achievements panel until completed.
  hidden?: boolean;
}

// How many of the four Act-2 trees are fully owned (all nodes bought).
function act2TreesCompleted(state: GameState): number {
  return ACT2_TREE_IDS.filter((treeId) => {
    const nodes = nodesForTree(treeId);
    return nodes.length > 0 && nodes.every((n) => state.skillNodes.includes(n.id));
  }).length;
}

// Rewards here are gold/pack only — Shard Points come solely from duck
// dupe overflow (PLAN2.md v2 patch: no more SP drips from achievements).
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "firstCrit", name: "First Blood", desc: "Land your first critical hit", metric: (s) => s.lifetime.crits, target: 1, reward: { gold: 20 } },
  { id: "hits100", name: "Getting the Hang of It", desc: "Land 100 hits", metric: (s) => s.lifetime.hits, target: 100, reward: { gold: 50 } },
  { id: "gold1k", name: "Nest Egg", desc: "Earn 1,000 lifetime gold", metric: (s) => s.lifetime.gold, target: 1000, reward: { gold: 200 } },
  { id: "gold10k", name: "Golden Goose", desc: "Earn 10,000 lifetime gold", metric: (s) => s.lifetime.gold, target: 10000, reward: { gold: 1000 } },
  { id: "packs5", name: "Pack Rat", desc: "Open 5 packs", metric: (s) => s.lifetime.packs, target: 5, reward: { packCredits: { standard: 1 } } },
  { id: "nodes10", name: "Budding Tree", desc: "Own 10 skill nodes", metric: (s) => s.skillNodes.length, target: 10, reward: { gold: 500 } },
  { id: "nodes30", name: "Full Bloom", desc: "Own all 30 Act 1 skill nodes", metric: (s) => s.skillNodes.length, target: 30, reward: { packCredits: { five: 1 } } },
  { id: "level10", name: "Rising Star", desc: "Reach player level 10", metric: (s) => s.level, target: 10, reward: { gold: 300 } },
  { id: "level20", name: "Seasoned Duck", desc: "Reach player level 20", metric: (s) => s.level, target: 20, reward: { packCredits: { five: 1 } } },
  { id: "wave10", name: "Arena Regular", desc: "Reach arena wave 10", metric: (s) => s.arena.wave, target: 10, reward: { gold: 200 } },
  { id: "wave25", name: "Colosseum Champion", desc: "Reach arena wave 25", metric: (s) => s.arena.wave, target: 25, reward: { gold: 1500 } },
  { id: "streak25", name: "On a Roll", desc: "Reach a 25-crit streak", metric: (s) => s.streak.best, target: 25, reward: { gold: 400 } },
  { id: "streak100", name: "QUACKENING", desc: "Reach a 100-crit streak", metric: (s) => s.streak.best, target: 100, reward: { packCredits: { pack25: 1 } } },
  { id: "collector5", name: "Small Flock", desc: "Collect 5 different ducks", metric: (s) => s.ducks.length, target: 5, reward: { gold: 150 } },
  { id: "collector13", name: "Founding Flock", desc: "Collect all 13 founding ducks", metric: (s) => s.ducks.length, target: 13, reward: { packCredits: { standard: 2 } } },

  // --- New visible achievements (PLAN2.md v2 patch: more content pass) ---
  { id: "firstAscension", name: "Reborn", desc: "Ascend a duck for the first time", metric: (s) => s.ducks.filter((d) => (d.ascension ?? 0) > 0).length, target: 1, reward: { gold: 500 } },
  { id: "ascend5", name: "Prestige Circle", desc: "Ascend ducks 5 times total", metric: (s) => s.ducks.reduce((sum, d) => sum + (d.ascension ?? 0), 0), target: 5, reward: { packCredits: { five: 1 } } },
  { id: "expeditions10", name: "Well Traveled", desc: "Complete 10 expeditions", metric: (s) => s.lifetime.expeditionsCompleted, target: 10, reward: { gold: 800 } },
  { id: "leaves50", name: "Bubble Popper", desc: "Pop 50 pond bubbles", metric: (s) => s.lifetime.bubblesPopped, target: 50, reward: { gold: 600 } },
  { id: "quackeningHolder", name: "Living Legend", desc: "Reach a 150-crit streak", metric: (s) => s.streak.best, target: 150, reward: { packCredits: { pack25: 1 } } },
  { id: "allOres", name: "Prospector", desc: "Unlock all 6 ore types", metric: (s) => getStats(s).unlockedOres.length, target: 6, reward: { gold: 2000 } },
  { id: "act2trees4", name: "Grand Gardener", desc: "Complete all four Act 2 trees", metric: act2TreesCompleted, target: 4, reward: { packCredits: { pack100: 1 } } },
  { id: "wave50", name: "Wave Fifty", desc: "Win arena wave 50", metric: (s) => s.arena.wave, target: 50, reward: { gold: 5000 } },
  { id: "ducks50", name: "Flock Leader", desc: "Own 50 ducks", metric: (s) => s.ducks.length, target: 50, reward: { packCredits: { pack25: 1 } } },

  // --- Hidden achievements: render as "??? — Hidden achievement" until done ---
  { id: "ownDuckTree", name: "The Legend Grows", desc: "Own the exclusive Duck Tree", metric: (s) => (s.ducks.some((d) => d.defId === "duckTree") ? 1 : 0), target: 1, reward: { gold: 3000 }, hidden: true },
  { id: "pondlord10", name: "Pondlord's Bane", desc: "Defeat The Pondlord 10 times", metric: (s) => s.lifetime.bossesDefeated, target: 10, reward: { gold: 2500 }, hidden: true },
  { id: "divine3", name: "Touched by Divinity", desc: "Pull 3 divine ducks (lifetime)", metric: (s) => s.lifetime.divinePulls, target: 3, reward: { packCredits: { pack100: 1 } }, hidden: true },
  { id: "gold1m", name: "Tycoon", desc: "Earn 1,000,000 lifetime gold", metric: (s) => s.lifetime.gold, target: 1_000_000, reward: { packCredits: { pack100: 2 } }, hidden: true },
];

// Checks every not-yet-completed achievement and grants rewards for any
// that just crossed their threshold.
export function checkAchievements(state: GameState): void {
  for (const def of ACHIEVEMENTS) {
    if (state.achievementsCompleted.includes(def.id)) continue;
    if (def.metric(state) < def.target) continue;
    state.achievementsCompleted.push(def.id);
    applyReward(state, def.reward);
    emit("achievement", { id: def.id, name: def.name });
  }
}
