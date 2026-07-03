import { getDuckDef } from "./ducks";
import { createInitialState, isRoleEligible } from "./state";
import type { GameState } from "./types";

const SAVE_KEY = "crittingDucks.save";
const CORRUPT_KEY = "crittingDucks.save.corrupt";

// Minimal localStorage-shaped interface so tests can inject a Map-backed
// fake instead of touching the real DOM.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Chain saves forward one version at a time; mergeWithDefaults then fills any
// fields a newer schema added.
function migrate(raw: { version: number; state: unknown }): Partial<GameState> {
  let state = raw.state as Partial<GameState>;
  let version = raw.version;
  if (version === 1) {
    // v1 → v2: no structural changes; new v2 fields default via merge.
    state = { ...state, version: 2 };
    version = 2;
  }
  return state;
}

// Drops any defId from a roster whose duck def's role is no longer eligible
// for that roster (e.g. a fighter that used to sit in the mine before role
// enforcement shipped). Evicted ducks simply return to the bench — they stay
// in state.ducks, just out of the roster arrays. Unknown defIds (a def that
// no longer exists) are dropped too rather than throwing.
function evictIneligibleRosterDucks(rosters: GameState["rosters"]): GameState["rosters"] {
  const evict = (panel: "mine" | "arena" | "pond", defIds: string[]) =>
    defIds.filter((defId) => {
      try {
        return isRoleEligible(panel, getDuckDef(defId).role);
      } catch {
        return false;
      }
    });
  return {
    mine: evict("mine", rosters.mine),
    arena: evict("arena", rosters.arena),
    pond: evict("pond", rosters.pond),
  };
}

function mergeWithDefaults(partial: Partial<GameState>): GameState {
  const base = createInitialState();
  return {
    ...base,
    ...partial,
    lifetime: { ...base.lifetime, ...partial.lifetime },
    ores: { ...base.ores, ...partial.ores },
    rosters: evictIneligibleRosterDucks({ ...base.rosters, ...partial.rosters }),
    streak: {
      ...base.streak,
      ...partial.streak,
      buffExpiry: { ...base.streak.buffExpiry, ...partial.streak?.buffExpiry },
    },
    arena: { ...base.arena, ...partial.arena },
    chapter: partial.chapter ?? base.chapter,
    leaves: partial.leaves ?? base.leaves,
    nextLeafAt: partial.nextLeafAt ?? base.nextLeafAt,
    expeditions: partial.expeditions ?? base.expeditions,
    packCredits: { ...base.packCredits, ...partial.packCredits },
    unlockedDucks: partial.unlockedDucks ?? base.unlockedDucks,
    materials: { ...base.materials, ...partial.materials },
    equipment: partial.equipment ?? base.equipment,
    achievementsCompleted: partial.achievementsCompleted ?? base.achievementsCompleted,
    missions: { ...base.missions, ...partial.missions },
    pinnedMission: { ...base.pinnedMission, ...partial.pinnedMission },
    // A save with no tutorial field predates the tutorial (or was loaded,
    // meaning the player already exists — first-timers get
    // createInitialState() directly and never pass through this merge).
    tutorial: partial.tutorial ?? { step: 0, done: true, finaleGranted: true },
    settings: {
      ...base.settings,
      ...partial.settings,
      panelsMinimized: { ...base.settings.panelsMinimized, ...partial.settings?.panelsMinimized },
    },
  };
}

export function save(state: GameState, storage: StorageLike): void {
  state.lastSaved = Date.now();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state }));
}

export function load(storage: StorageLike): GameState | null {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(migrate(parsed));
  } catch (err) {
    console.warn("Corrupt save detected, starting fresh.", err);
    storage.setItem(CORRUPT_KEY, raw);
    return null;
  }
}

export function exportSave(state: GameState): string {
  return JSON.stringify({ version: 2, state });
}

// Parses pasted JSON through the same migrate/merge pipeline as load.
// Returns null (without touching storage) if the input is unusable.
export function importSave(json: string, storage: StorageLike): GameState | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || typeof parsed.version !== "number") {
      return null;
    }
    const state = mergeWithDefaults(migrate(parsed));
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 2, state }));
    return state;
  } catch {
    return null;
  }
}

export function clearSave(storage: StorageLike): void {
  storage.removeItem(SAVE_KEY);
}
