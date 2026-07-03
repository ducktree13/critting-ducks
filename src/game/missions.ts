import { emit } from "./events";
import { applyReward } from "./state";
import type { GameState, MissionInstance, MissionSection, Reward, Rng } from "./types";

interface MissionTemplate {
  id: string;
  section: MissionSection;
  name: string;
  metric: (state: GameState) => number;
  increment: (state: GameState) => number; // progress required, scales with player level
  desc: (amount: number) => string;
  reward: (amount: number) => Reward;
}

const sumOres = (state: GameState) => Object.values(state.ores).reduce((a, b) => a + b, 0);

export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  {
    id: "mineOre",
    section: "mine",
    name: "Ore Quota",
    metric: sumOres,
    increment: (s) => Math.max(20, Math.round(20 * Math.pow(1.6, s.level - 1))),
    desc: (n) => `Mine ${Math.round(n)} more ore`,
    reward: (n) => ({ gold: Math.round(n * 2) }),
  },
  {
    id: "mineGold",
    section: "mine",
    name: "Gold Haul",
    metric: (s) => s.lifetime.gold,
    increment: (s) => Math.max(50, Math.round(50 * Math.pow(1.6, s.level - 1))),
    desc: (n) => `Earn ${Math.round(n)} more gold`,
    reward: (n) => ({ gold: Math.round(n * 0.5) }),
  },
  {
    id: "treeNodes",
    section: "tree",
    name: "Tree Growth",
    metric: (s) => s.skillNodes.length,
    increment: () => 3,
    desc: (n) => `Buy ${n} more skill node${n === 1 ? "" : "s"}`,
    reward: () => ({ packCredits: { standard: 1 } }),
  },
  {
    id: "treeLevel",
    section: "tree",
    name: "Level Up",
    metric: (s) => s.level,
    increment: (s) => Math.max(1, Math.round(s.level * 0.5)),
    desc: (n) => `Gain ${n} more player level${n === 1 ? "" : "s"}`,
    reward: () => ({ gold: 200 }),
  },
  {
    id: "arenaWave",
    section: "arena",
    name: "Wave Runner",
    metric: (s) => s.arena.wave,
    increment: () => 5,
    desc: (n) => `Clear ${n} more waves`,
    reward: () => ({ gold: 300 }),
  },
  {
    id: "arenaStreak",
    section: "arena",
    name: "Streak Chaser",
    metric: (s) => s.streak.best,
    increment: () => 5,
    desc: (n) => `Beat your best streak by ${n}`,
    reward: () => ({ gold: 250 }),
  },
];

const TEMPLATES_BY_ID = new Map(MISSION_TEMPLATES.map((t) => [t.id, t]));
const SECTIONS: MissionSection[] = ["mine", "tree", "arena"];
const ACTIVE_PER_SECTION = 2;

let nextInstanceId = 1;

function rollMission(state: GameState, section: MissionSection, rng: Rng): MissionInstance {
  const candidates = MISSION_TEMPLATES.filter((t) => t.section === section);
  const active = state.missions[section].map((m) => m.templateId);
  const fresh = candidates.filter((t) => !active.includes(t.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const template = pool[Math.min(Math.floor(rng.next() * pool.length), pool.length - 1)];

  const startValue = template.metric(state);
  const amount = template.increment(state);
  return {
    id: `m${nextInstanceId++}`,
    templateId: template.id,
    section,
    startValue,
    target: startValue + amount,
    completed: false,
  };
}

// Keeps each section topped up to ACTIVE_PER_SECTION active missions.
export function ensureMissions(state: GameState, rng: Rng): void {
  for (const section of SECTIONS) {
    while (state.missions[section].length < ACTIVE_PER_SECTION) {
      state.missions[section].push(rollMission(state, section, rng));
    }
  }
}

export function missionTemplate(instance: MissionInstance) {
  return TEMPLATES_BY_ID.get(instance.templateId)!;
}

export function missionProgress(state: GameState, instance: MissionInstance): { current: number; target: number } {
  const template = missionTemplate(instance);
  const current = Math.min(template.metric(state) - instance.startValue, instance.target - instance.startValue);
  return { current, target: instance.target - instance.startValue };
}

// Checks every active mission for completion, grants rewards, and replaces
// completed ones with a freshly rolled mission for that section.
export function checkMissions(state: GameState, rng: Rng): void {
  for (const section of SECTIONS) {
    const list = state.missions[section];
    for (const instance of list) {
      if (instance.completed) continue;
      const template = missionTemplate(instance);
      if (template.metric(state) < instance.target) continue;

      instance.completed = true;
      const amount = instance.target - instance.startValue;
      applyReward(state, template.reward(amount));
      emit("missionComplete", { section, name: template.name });
      if (state.pinnedMission[section] === instance.id) state.pinnedMission[section] = null;
    }
    state.missions[section] = list.filter((m) => !m.completed);
  }
  ensureMissions(state, rng);
}

export function pinMission(state: GameState, section: MissionSection, missionId: string | null): void {
  if (missionId !== null && !state.missions[section].some((m) => m.id === missionId)) return;
  state.pinnedMission[section] = missionId;
}
