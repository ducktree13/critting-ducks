import { beforeEach, describe, expect, it } from "vitest";
import { createInitialState } from "./state";
import { advanceManualStep, advanceTutorial, skipTutorial, TUTORIAL_STEPS } from "./tutorial";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("advanceManualStep", () => {
  it("moves from the manual welcome step to step 1", () => {
    expect(state.tutorial.step).toBe(0);
    advanceManualStep(state);
    expect(state.tutorial.step).toBe(1);
  });
});

describe("advanceTutorial", () => {
  it("auto-advances through already-satisfied non-manual steps", () => {
    advanceManualStep(state); // step 0 -> 1 (buy crit1)
    state.skillNodes.push("crit1");
    advanceTutorial(state);
    expect(state.tutorial.step).toBe(2); // shop step
  });

  it("grants Quackers on entering the roster step, exactly once", () => {
    advanceManualStep(state); // -> 1
    state.skillNodes.push("crit1");
    advanceTutorial(state); // -> 2
    state.lifetime.packs = 1;
    advanceTutorial(state); // -> 3, grants Quackers
    expect(state.ducks.filter((d) => d.defId === "quackers")).toHaveLength(1);

    advanceTutorial(state); // re-running must not duplicate the gift
    expect(state.ducks.filter((d) => d.defId === "quackers")).toHaveLength(1);
  });

  it("does not advance past a manual step even if its condition looks done", () => {
    // Step 0 is manual and always "complete"; must wait for the player.
    advanceTutorial(state);
    expect(state.tutorial.step).toBe(0);
  });

  it("stops at the finale step (also manual) until Finish is clicked", () => {
    state.tutorial.step = TUTORIAL_STEPS.length - 1;
    advanceTutorial(state);
    expect(state.tutorial.step).toBe(TUTORIAL_STEPS.length - 1);
    expect(state.tutorial.done).toBe(false);
  });

  it("grants exactly one guaranteed-rare pack credit on reaching the finale", () => {
    state.tutorial.step = TUTORIAL_STEPS.length - 1;
    const before = state.packCredits.pack25;
    advanceTutorial(state);
    advanceTutorial(state); // idempotent re-entry
    expect(state.packCredits.pack25).toBe(before + 1);
  });

  it("finishing the finale via advanceManualStep marks the tutorial done", () => {
    state.tutorial.step = TUTORIAL_STEPS.length - 1;
    advanceManualStep(state);
    expect(state.tutorial.done).toBe(true);
  });
});

describe("skipTutorial", () => {
  it("marks the tutorial done without altering progress", () => {
    skipTutorial(state);
    expect(state.tutorial.done).toBe(true);
    expect(state.ducks).toHaveLength(1); // no Quackers gift skipped-in
  });
});
