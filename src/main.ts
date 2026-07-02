import "./style.css";
import { AUTOSAVE_INTERVAL_MS, FRAME_GAP_THRESHOLD_SEC, MAX_ACCUMULATOR_SEC, TICK_SEC } from "./game/balance";
import { tickMine } from "./game/mine";
import { mulberry32 } from "./game/rng";
import { load, save } from "./game/save";
import { createInitialState, refreshStats } from "./game/state";
import { gameSpeed } from "./game/streak";
import type { GameState, Rng } from "./game/types";
import { initFloaters } from "./ui/floaters";
import { initHud, renderHud } from "./ui/hud";
import { initMinePanel, renderMinePanel } from "./ui/minePanel";

const storage = window.localStorage;
const state: GameState = load(storage) ?? createInitialState();
const rng: Rng = mulberry32(Date.now() >>> 0);

// Dev-only handle for manual verification (PLAN.md §12); stripped from builds.
if (import.meta.env.DEV) {
  (window as unknown as { __cd: { state: GameState } }).__cd = { state };
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="hud"></header>
  <main class="panels">
    <section class="panel" id="mine-panel"></section>
    <section class="panel" id="tree-panel">
      <h2>Skill Tree</h2>
      <div class="panel-body">The tree will grow here soon.</div>
    </section>
    <section class="panel" id="arena-panel">
      <h2>Arena</h2>
      <div class="panel-body">Battles will happen here soon.</div>
    </section>
  </main>
`;

const minePanelEl = app.querySelector<HTMLElement>("#mine-panel")!;
const arenaPanelEl = app.querySelector<HTMLElement>("#arena-panel")!;

initHud(app.querySelector("header.hud")!);
initMinePanel(minePanelEl, state);
initFloaters({ mine: minePanelEl, arena: arenaPanelEl });

function simTick(s: GameState, dt: number, r: Rng): void {
  refreshStats(s, Date.now());
  tickMine(s, dt, r);
}

function render(s: GameState): void {
  renderHud(s);
  renderMinePanel(s);
}

let lastFrame = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const realDeltaSeconds = (now - lastFrame) / 1000;
  lastFrame = now;

  if (realDeltaSeconds > FRAME_GAP_THRESHOLD_SEC) {
    // Tab was hidden/throttled. Offline progress (Phase 6) will fill this
    // gap; for now just drop it so the accumulator can't spin. Buff timers
    // expire naturally by timestamp; the streak does not survive the gap.
    accumulator = 0;
    state.streak.current = 0;
  } else {
    accumulator = Math.min(accumulator + realDeltaSeconds * gameSpeed(state), MAX_ACCUMULATOR_SEC);
    while (accumulator >= TICK_SEC) {
      simTick(state, TICK_SEC, rng);
      accumulator -= TICK_SEC;
    }
  }

  render(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

setInterval(() => save(state, storage), AUTOSAVE_INTERVAL_MS);
window.addEventListener("beforeunload", () => save(state, storage));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save(state, storage);
});
