import { describe, expect, it } from "vitest";
import { clearSave, exportSave, importSave, load, save, type StorageLike } from "./save";
import { createInitialState } from "./state";

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
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
    expect(loaded!.ores).toEqual({ copper: 0, silver: 0, crystal: 0, starmetal: 0, voidstone: 0, aurorium: 0 });
    expect(loaded!.streak.buffExpiry).toEqual({ t10: 0, t25: 0, t50: 0, t100: 0 });
  });

  it("migrates a full v1 save to v2 preserving all progress", () => {
    const storage = fakeStorage();
    // Representative v1 save captured from the live game (trimmed).
    const v1 = {
      version: 1,
      state: {
        version: 1,
        gold: 4321.5,
        xp: 250,
        level: 7,
        lifetime: { gold: 9999, crits: 321, hits: 1000, packs: 3 },
        ores: { copper: 4800, silver: 160, crystal: 0, starmetal: 0 },
        selectedOre: "silver",
        ducks: [
          { defId: "bill", level: 2, shards: 1, nextHitIn: 0.4 },
          { defId: "puddle", level: 1, shards: 0, nextHitIn: 0.9 },
        ],
        rosters: { mine: ["bill", "puddle"], arena: [] },
        skillNodes: ["crit1", "speed1", "ore1", "ore2", "oresilver"],
        streak: { current: 3, best: 17, buffExpiry: { t10: 0, t25: 0, t50: 0, t100: 0 }, shieldReadyAt: 0 },
        arena: { wave: 12, enemyHp: 50, enemyMaxHp: 100, enemyNextHitIn: 1, teamHp: 0, teamMaxHp: 0, retryAt: 0 },
        settings: { darkMode: true },
        lastSaved: 1750000000000,
        createdAt: 1749000000000,
      },
    };
    storage.setItem("crittingDucks.save", JSON.stringify(v1));

    const loaded = load(storage);

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(2);
    expect(loaded!.gold).toBeCloseTo(4321.5);
    expect(loaded!.level).toBe(7);
    expect(loaded!.ducks).toHaveLength(2);
    expect(loaded!.skillNodes).toContain("oresilver");
    expect(loaded!.streak.best).toBe(17);
    expect(loaded!.arena.wave).toBe(12);
    expect(loaded!.settings.darkMode).toBe(true);
    // C2 migration: the old scalar enemy becomes a 1-element enemies array,
    // preserving hp/maxHp/timer, and defeated defaults to [].
    expect(loaded!.arena.enemies).toHaveLength(1);
    expect(loaded!.arena.enemies[0].hp).toBe(50);
    expect(loaded!.arena.enemies[0].maxHp).toBe(100);
    expect(loaded!.arena.enemies[0].nextHitIn).toBe(1);
    expect(loaded!.arena.enemies[0].id).toBe("rubber-shark"); // wave 12 → (12-1)%4=3
    expect(loaded!.arena.defeated).toEqual([]);
    expect("enemyHp" in loaded!.arena).toBe(false);
  });

  it("export → import round-trips through the migrate/merge pipeline", () => {
    const storage = fakeStorage();
    const state = createInitialState();
    state.gold = 777;
    state.settings.darkMode = true;

    const json = exportSave(state);
    const imported = importSave(json, storage);

    expect(imported).not.toBeNull();
    expect(imported!.gold).toBe(777);
    expect(imported!.settings.darkMode).toBe(true);
    expect(load(storage)!.gold).toBe(777); // written to storage too
  });

  it("importSave rejects garbage without touching storage", () => {
    const storage = fakeStorage();
    expect(importSave("not json at all", storage)).toBeNull();
    expect(importSave('{"no":"version"}', storage)).toBeNull();
    expect(load(storage)).toBeNull();
  });

  it("clearSave removes the save", () => {
    const storage = fakeStorage();
    save(createInitialState(), storage);
    clearSave(storage);
    expect(load(storage)).toBeNull();
  });

  it("evicts ducks whose role is no longer eligible for their roster on load", () => {
    const storage = fakeStorage();
    // A save from before role enforcement shipped (PLAN2.md §4 Phase B):
    // quackers (fighter) sitting in mine, bill (miner) sitting in arena,
    // puddle (pond) sitting in arena. All three should be evicted back to
    // the bench (state.ducks keeps them; only the roster arrays change).
    storage.setItem(
      "crittingDucks.save",
      JSON.stringify({
        version: 2,
        state: {
          version: 2,
          ducks: [
            { defId: "bill", level: 1, shards: 0, nextHitIn: 1 },
            { defId: "quackers", level: 1, shards: 0, nextHitIn: 1 },
            { defId: "puddle", level: 1, shards: 0, nextHitIn: 1 },
          ],
          rosters: { mine: ["quackers"], arena: ["bill", "puddle"], pond: [] },
        },
      }),
    );

    const loaded = load(storage);

    expect(loaded).not.toBeNull();
    expect(loaded!.rosters.mine).not.toContain("quackers");
    expect(loaded!.rosters.arena).not.toContain("bill");
    expect(loaded!.rosters.arena).not.toContain("puddle");
    // Evicted ducks stay owned, just off the roster.
    expect(loaded!.ducks.map((d) => d.defId)).toEqual(["bill", "quackers", "puddle"]);
  });

  it("keeps role-eligible ducks in their roster on load", () => {
    const storage = fakeStorage();
    storage.setItem(
      "crittingDucks.save",
      JSON.stringify({
        version: 2,
        state: {
          version: 2,
          ducks: [
            { defId: "bill", level: 1, shards: 0, nextHitIn: 1 },
            { defId: "quackers", level: 1, shards: 0, nextHitIn: 1 },
          ],
          rosters: { mine: ["bill"], arena: ["quackers"], pond: [] },
        },
      }),
    );

    const loaded = load(storage);

    expect(loaded!.rosters.mine).toContain("bill");
    expect(loaded!.rosters.arena).toContain("quackers");
  });

  it("falls back to null and stashes corrupt JSON instead of wiping it", () => {
    const storage = fakeStorage();
    storage.setItem("crittingDucks.save", "{not valid json");

    const loaded = load(storage);

    expect(loaded).toBeNull();
    expect(storage.getItem("crittingDucks.save.corrupt")).toBe("{not valid json");
  });
});
