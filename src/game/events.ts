import type { MaterialId, MissionSection } from "./types";

export interface GameEventMap {
  hit: { panel: "mine" | "arena"; duckId: string; isCrit: boolean; gold: number; xp: number; ore: number; dmg: number; targetId?: string };
  crit: { panel: "mine" | "arena"; duckId: string };
  levelup: { level: number };
  enemyhit: { dmg: number; isCrit: boolean };
  firstDefeat: { enemyId: string; name: string; xp: number };
  wave: { wave: number; boss: boolean; gold: number; xp: number };
  buy: { nodeId: string };
  gacha: { results: { defId: string; isNew: boolean; shardsGained: number }[] };
  roster: Record<string, never>;
  missionComplete: { section: MissionSection; name: string };
  achievement: { id: string; name: string };
  materialDrop: { material: MaterialId };
  chapterAdvance: { chapter: number };
  bubblePopped: { kind: "gold" | "xp" | "duck"; amount: number; isCrit: boolean };
  expeditionReady: { id: string };
  expeditionClaimed: { success: boolean; isCrit: boolean; gold: number; xp: number };
}

export type GameEventName = keyof GameEventMap;
type Listener<K extends GameEventName> = (payload: GameEventMap[K]) => void;

const listeners = new Map<GameEventName, Set<(payload: unknown) => void>>();

export function on<K extends GameEventName>(name: K, fn: Listener<K>): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn as (payload: unknown) => void);
  return () => set!.delete(fn as (payload: unknown) => void);
}

export function emit<K extends GameEventName>(name: K, payload: GameEventMap[K]): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of set) fn(payload);
}
