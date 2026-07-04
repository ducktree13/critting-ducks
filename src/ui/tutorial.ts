import { advanceManualStep, advanceTutorial, skipTutorial, TUTORIAL_STEPS } from "../game/tutorial";
import type { GameState } from "../game/types";

let overlay: HTMLElement;
let spotlightEl: HTMLElement;
let titleEl: HTMLElement;
let bodyEl: HTMLElement;
let nextBtn: HTMLButtonElement;
let gameState: GameState;

export function initTutorial(state: GameState): void {
  gameState = state;
  overlay = document.createElement("div");
  overlay.className = "tutorial-overlay";
  overlay.innerHTML = `
    <div class="tutorial-spotlight" id="tut-spotlight"></div>
    <div class="tutorial-banner">
      <b id="tut-title"></b>
      <p id="tut-body"></p>
      <div class="tutorial-actions">
        <button id="tut-skip">Skip tutorial</button>
        <button id="tut-next" class="tt-primary">Next</button>
      </div>
    </div>
  `;
  spotlightEl = overlay.querySelector("#tut-spotlight")!;
  titleEl = overlay.querySelector("#tut-title")!;
  bodyEl = overlay.querySelector("#tut-body")!;
  nextBtn = overlay.querySelector("#tut-next")!;

  overlay.querySelector("#tut-skip")!.addEventListener("click", () => {
    skipTutorial(gameState);
    renderTutorial(gameState);
  });
  nextBtn.addEventListener("click", () => {
    advanceManualStep(gameState);
    renderTutorial(gameState);
  });

  document.body.appendChild(overlay);
}

// Index of the "open a pack" step — kept in sync with tutorial.ts by name
// rather than a hardcoded index, so this file doesn't drift if steps are
// reordered.
const PACK_STEP_INDEX = TUTORIAL_STEPS.findIndex((s) => s.highlight === "#hud-shop");

// Edge-detection cache so a per-frame call can early-out cheaply once the
// tutorial is done (the common case for the rest of a session) and can skip
// re-querying/writing the spotlight rect when the highlighted target's
// bounding box hasn't actually moved (e.g. static header buttons).
let lastDone = false;
let lastStep = -1;
let lastTargetSelector: string | null | undefined;
let lastRectKey = "";

export function renderTutorial(state: GameState): void {
  advanceTutorial(state);

  // The Standard pack button glows only while the "open a pack" step is the
  // current, unfinished step — cleared as soon as the tutorial moves on or
  // finishes, even if the shop modal isn't open right now.
  const packBtn = document.getElementById("pack-standard");
  const wantsPackGlow = !state.tutorial.done && state.tutorial.step === PACK_STEP_INDEX;
  packBtn?.classList.toggle("tutorial-glow", wantsPackGlow);

  if (state.tutorial.done) {
    if (!lastDone) {
      overlay.classList.remove("show");
      lastDone = true;
    }
    return;
  }
  lastDone = false;
  overlay.classList.add("show");

  const step = TUTORIAL_STEPS[state.tutorial.step];
  if (state.tutorial.step !== lastStep) {
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    nextBtn.style.display = step.manual ? "inline-block" : "none";
    nextBtn.textContent = state.tutorial.step === TUTORIAL_STEPS.length - 1 ? "Finish" : "Next";
    lastStep = state.tutorial.step;
    lastTargetSelector = undefined; // force a fresh rect query for the new step
  }

  const target = step.highlight ? document.querySelector(step.highlight) : null;
  if (target) {
    const r = target.getBoundingClientRect();
    // Round to whole pixels: sub-pixel layout jitter from repeated reflow
    // shouldn't force a style write every frame.
    const rectKey = `${step.highlight}|${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
    if (rectKey !== lastRectKey) {
      spotlightEl.style.display = "block";
      spotlightEl.style.left = `${r.left - 6}px`;
      spotlightEl.style.top = `${r.top - 6}px`;
      spotlightEl.style.width = `${r.width + 12}px`;
      spotlightEl.style.height = `${r.height + 12}px`;
      lastRectKey = rectKey;
    }
  } else if (lastTargetSelector !== null) {
    spotlightEl.style.display = "none";
    lastRectKey = "";
    lastTargetSelector = null;
  }
}
