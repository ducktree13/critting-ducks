import { createInitialState } from "./state";
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

function migrate(raw: { version: number; state: unknown }): Partial<GameState> {
  switch (raw.version) {
    case 1:
    default:
      return raw.state as Partial<GameState>;
  }
}

function mergeWithDefaults(partial: Partial<GameState>): GameState {
  const base = createInitialState();
  return {
    ...base,
    ...partial,
    lifetime: { ...base.lifetime, ...partial.lifetime },
    ores: { ...base.ores, ...partial.ores },
    rosters: { ...base.rosters, ...partial.rosters },
    streak: {
      ...base.streak,
      ...partial.streak,
      buffExpiry: { ...base.streak.buffExpiry, ...partial.streak?.buffExpiry },
    },
    arena: { ...base.arena, ...partial.arena },
    settings: { ...base.settings, ...partial.settings },
  };
}

export function save(state: GameState, storage: StorageLike): void {
  state.lastSaved = Date.now();
  storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state }));
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
  return JSON.stringify({ version: 1, state });
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
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state }));
    return state;
  } catch {
    return null;
  }
}

export function clearSave(storage: StorageLike): void {
  storage.removeItem(SAVE_KEY);
}
