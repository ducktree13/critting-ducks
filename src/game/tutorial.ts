import { makeOwnedDuck } from "./ducks";
import type { GameState } from "./types";

export interface TutorialStepDef {
  title: string;
  body: string;
  highlight: string | null; // CSS selector the UI spotlights
  manual: boolean; // requires the player to click Next/Finish, rather than auto-advancing
  isComplete: (state: GameState) => boolean;
}

// A scripted 5-minute chain: mine → buy a node → open a pack → roster the
// tutorial gift duck → win a wave → finale reward. New games start with
// Bill mining alone; Quackers arrives here instead of as a starting duck.
export const TUTORIAL_STEPS: readonly TutorialStepDef[] = [
  {
    title: "Welcome to Critting Ducks!",
    body: "Bill is already mining copper — watch your gold climb in the corner.",
    highlight: "#mine-panel",
    manual: true,
    isComplete: () => true,
  },
  {
    title: "Grow the skill tree",
    body: "Buy Keen Eyes, the first skill node, to boost your crit chance.",
    highlight: '[data-node="crit1"]',
    manual: false,
    isComplete: (s) => s.skillNodes.includes("crit1"),
  },
  {
    title: "Visit the shop",
    body: "Open the Shop and open your free Standard Pack.",
    highlight: "#hud-shop",
    manual: false,
    isComplete: (s) => s.lifetime.packs >= 1,
  },
  {
    title: "Roster your new friend",
    body: "Quackers just joined your flock! Assign them to an Arena slot.",
    highlight: "#arena-panel",
    manual: false,
    isComplete: (s) => s.rosters.arena.includes("quackers"),
  },
  {
    title: "Win a battle",
    body: "Clear your first arena wave.",
    highlight: "#arena-panel",
    manual: false,
    isComplete: (s) => s.arena.wave >= 2,
  },
  {
    title: "You're ready!",
    body: "Here's a guaranteed rare-or-better pack to kick off your collection. Good luck out there!",
    highlight: null,
    manual: true,
    isComplete: () => false,
  },
];

// Side effects that fire once, idempotently, whenever a step becomes
// current — safe to call repeatedly (e.g. across a reload mid-step).
function applyStepEntry(state: GameState, step: number): void {
  if (step === 3 && !state.ducks.some((d) => d.defId === "quackers")) {
    state.ducks.push(makeOwnedDuck("quackers"));
  }
  if (step === 5 && !state.tutorial.finaleGranted) {
    state.packCredits.pack25 += 1;
    state.tutorial.finaleGranted = true;
  }
}

// Advances through any already-satisfied non-manual steps (handles a
// reload landing mid-step) and applies that step's entry side effects.
export function advanceTutorial(state: GameState): void {
  if (state.tutorial.done) return;
  applyStepEntry(state, state.tutorial.step);
  while (
    state.tutorial.step < TUTORIAL_STEPS.length - 1 &&
    !TUTORIAL_STEPS[state.tutorial.step].manual &&
    TUTORIAL_STEPS[state.tutorial.step].isComplete(state)
  ) {
    state.tutorial.step += 1;
    applyStepEntry(state, state.tutorial.step);
  }
}

// Called by the Next/Finish button on a manual step.
export function advanceManualStep(state: GameState): void {
  const step = TUTORIAL_STEPS[state.tutorial.step];
  if (!step.manual) return;
  if (state.tutorial.step >= TUTORIAL_STEPS.length - 1) {
    state.tutorial.done = true;
    return;
  }
  state.tutorial.step += 1;
  applyStepEntry(state, state.tutorial.step);
}

export function skipTutorial(state: GameState): void {
  state.tutorial.done = true;
}
