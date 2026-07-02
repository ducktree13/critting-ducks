import { describe, expect, it } from "vitest";
import { load, save, type StorageLike } from "./save";
import { createInitialState } from "./state";

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("save/load", () => {
  it("round-trips a state through save and load", () => {
    const storage = fakeStorage();
    const state = createInitialState();
    state.gold = 1234;
    state.ducks.push({ defId: "bill", level: 2, shards: 3, nextHitIn: 0.5 });

    save(state, storage);
    const loaded = load(storage);

    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(1234);
    expect(loaded!.ducks).toEqual(state.ducks);
    expect(loaded!.lastSaved).toBe(state.lastSaved);
  });

  it("returns null when there is no save", () => {
    const storage = fakeStorage();
    expect(load(storage)).toBeNull();
  });

  it("fills in missing fields with defaults for older saves", () => {
    const storage = fakeStorage();
    storage.setItem(
      "crittingDucks.save",
      JSON.stringify({ version: 1, state: { gold: 500 } }),
    );

    const loaded = load(storage);

    expect(loaded).not.toBeNull();
    expect(loaded!.gold).toBe(500);
    expect(loaded!.level).toBe(1);
    expect(loaded!.ores).toEqual({ copper: 0, silver: 0, crystal: 0, starmetal: 0 });
    expect(loaded!.streak.buffExpiry).toEqual({ t10: 0, t25: 0, t50: 0, t100: 0 });
  });

  it("falls back to null and stashes corrupt JSON instead of wiping it", () => {
    const storage = fakeStorage();
    storage.setItem("crittingDucks.save", "{not valid json");

    const loaded = load(storage);

    expect(loaded).toBeNull();
    expect(storage.getItem("crittingDucks.save.corrupt")).toBe("{not valid json");
  });
});
