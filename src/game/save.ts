import { ARENA_BASE, ENEMY_TYPES } from "./balance";
import { getDuckDef } from "./ducks";
import { createInitialState, isRoleEligible } from "./state";
import type { ArenaState, GameState } from "./types";

// C2 migration: pre-C2 saves stored a scalar enemy (enemyHp/enemyMaxHp/
// enemyNextHitIn). Fold those into a 1-element enemies array (preserving wave
// progress) and default the new `enemies`/`defeated` fields.
function migrateArena(base: ArenaState, partial: Partial<ArenaState> | undefined): ArenaState {
  const merged = { ...base, ...partial } as ArenaState & {
    enemyHp?: number;
    enemyMaxHp?: number;
    enemyNextHitIn?: number;
  };
  // Only trust an enemies array the SAVE itself carried; otherwise (pre-C2
  // save) fold the old scalar fields into a 1-element array. `merged.enemies`
  // is never enough to check — the base defaults always provide one.
  const savedEnemies = partial?.enemies;
  if (!Array.isArray(savedEnemies) || savedEnemies.length === 0) {
    const wave = merged.wave ?? 1;
    const typeId = ENEMY_TYPES[(wave - 1) % ENEMY_TYPES.length].id;
    const maxHp = merged.enemyMaxHp ?? ARENA_BASE.baseEnemyHp;
    merged.enemies = [
      {
        id: typeId,
        hp: merged.enemyHp ?? maxHp,
        maxHp,
        nextHitIn: merged.enemyNextHitIn ?? 1 / ARENA_BASE.enemyAttackSpeed,
      },
    ];
  }
  if (!Array.isArray(merged.defeated)) merged.defeated = [];
  delete merged.enemyHp;
  delete merged.enemyMaxHp;
  delete merged.enemyNextHitIn;
  return {
    wave: merged.wave,
    enemies: merged.enemies,
    teamHp: merged.teamHp,
    teamMaxHp: merged.teamMaxHp,
    retryAt: merged.retryAt,
    defeated: merged.defeated,
  };
}

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
    arena: migrateArena(base.arena, partial.arena),
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
