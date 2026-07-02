import { emit } from "./events";
import { applyReward } from "./state";
import type { GameState, Reward } from "./types";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  metric: (state: GameState) => number;
  target: number;
  reward: Reward;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: "firstCrit", name: "First Blood", desc: "Land your first critical hit", metric: (s) => s.lifetime.crits, target: 1, reward: { gold: 20 } },
  { id: "hits100", name: "Getting the Hang of It", desc: "Land 100 hits", metric: (s) => s.lifetime.hits, target: 100, reward: { gold: 50 } },
  { id: "gold1k", name: "Nest Egg", desc: "Earn 1,000 lifetime gold", metric: (s) => s.lifetime.gold, target: 1000, reward: { shardPoints: 10 } },
  { id: "gold10k", name: "Golden Goose", desc: "Earn 10,000 lifetime gold", metric: (s) => s.lifetime.gold, target: 10000, reward: { shardPoints: 25 } },
  { id: "packs5", name: "Pack Rat", desc: "Open 5 packs", metric: (s) => s.lifetime.packs, target: 5, reward: { packCredits: { standard: 1 } } },
  { id: "nodes10", name: "Budding Tree", desc: "Own 10 skill nodes", metric: (s) => s.skillNodes.length, target: 10, reward: { gold: 500 } },
  { id: "nodes30", name: "Full Bloom", desc: "Own all 30 Act 1 skill nodes", metric: (s) => s.skillNodes.length, target: 30, reward: { shardPoints: 100 } },
  { id: "level10", name: "Rising Star", desc: "Reach player level 10", metric: (s) => s.level, target: 10, reward: { gold: 300 } },
  { id: "level20", name: "Seasoned Duck", desc: "Reach player level 20", metric: (s) => s.level, target: 20, reward: { packCredits: { five: 1 } } },
  { id: "wave10", name: "Arena Regular", desc: "Reach arena wave 10", metric: (s) => s.arena.wave, target: 10, reward: { gold: 200 } },
  { id: "wave25", name: "Colosseum Champion", desc: "Reach arena wave 25", metric: (s) => s.arena.wave, target: 25, reward: { shardPoints: 30 } },
  { id: "streak25", name: "On a Roll", desc: "Reach a 25-crit streak", metric: (s) => s.streak.best, target: 25, reward: { gold: 400 } },
  { id: "streak100", name: "QUACKENING", desc: "Reach a 100-crit streak", metric: (s) => s.streak.best, target: 100, reward: { packCredits: { pack25: 1 } } },
  { id: "collector5", name: "Small Flock", desc: "Collect 5 different ducks", metric: (s) => s.ducks.length, target: 5, reward: { gold: 150 } },
  { id: "collector13", name: "Founding Flock", desc: "Collect all 13 founding ducks", metric: (s) => s.ducks.length, target: 13, reward: { shardPoints: 50 } },
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
