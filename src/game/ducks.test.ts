import { beforeEach, describe, expect, it } from "vitest";
import { isDuckUnlocked } from "./ducks";
import { createInitialState } from "./state";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("isDuckUnlocked", () => {
  it("treats every current duck (no lockedBy set) as unlocked", () => {
    for (const id of ["bill", "goose", "deathbill"]) {
      expect(isDuckUnlocked(state, id)).toBe(true);
    }
  });

  it("starts unlockedDucks empty on a new game", () => {
    expect(state.unlockedDucks).toEqual([]);
  });
});
