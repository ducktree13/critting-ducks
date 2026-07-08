import { beforeEach, describe, expect, it } from "vitest";
import { rollMaterialDrop } from "./gear";
import { createInitialState } from "./state";
import type { GameState, Rng } from "./types";

const NO_DROP: Rng = { next: () => 0.999 };
const ALWAYS_DROP: Rng = { next: () => 0 };

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("rollMaterialDrop", () => {
  it("guarantees the boss relic on boss waves", () => {
    const material = rollMaterialDrop(state, NO_DROP, 10, true);
    expect(material).toBe("pondlordRelic");
    expect(state.materials.pondlordRelic).toBe(1);
  });

  it("drops nothing below the roll threshold on normal waves", () => {
    const material = rollMaterialDrop(state, NO_DROP, 3, false);
    expect(material).toBeNull();
  });

  it("themes the material to the wave's enemy family", () => {
    const material = rollMaterialDrop(state, ALWAYS_DROP, 1, false);
    expect(material).toBe("slimeGoo");
    expect(state.materials.slimeGoo).toBe(1);
  });
});
