import "./fonts.css";
import "./tokens.css";
import "./style.css";
import "./components.css";
import { checkAchievements } from "./game/achievements";
import { tickArena } from "./game/arena";
import { AUTOSAVE_INTERVAL_MS, FRAME_GAP_THRESHOLD_SEC, MAX_ACCUMULATOR_SEC, OFFLINE, TICK_SEC } from "./game/balance";
import { checkChapterTransition } from "./game/chapters";
import { checkExpeditions } from "./game/expeditions";
import { tickBubbles } from "./game/bubbles";
import { checkMissions, ensureMissions } from "./game/missions";
import { tickMine } from "./game/mine";
import { computeOfflineProgress, offlineIncomePerSec } from "./game/offline";
import { pondIncomePerSec, tickPond } from "./game/pond";
import { mulberry32 } from "./game/rng";
import { clearSave, exportSave, importSave, load, save } from "./game/save";
import { computeStats, createInitialState, getStats, grantXp, refreshStats } from "./game/state";
import { gameSpeed } from "./game/streak";
import type { GameState, Rng } from "./game/types";
import { initAchievementsPanel } from "./ui/achievementsPanel";
import { initArenaPanel, renderArenaPanel } from "./ui/arenaPanel";
import { initCraftingMenu } from "./ui/craftingMenu";
import { initExpeditionPanel } from "./ui/expeditionPanel";
import { initFloaters } from "./ui/floaters";
import { initHud, renderHud } from "./ui/hud";
import { initInventoryMenu } from "./ui/inventoryMenu";
import { initItemsMenu } from "./ui/itemsMenu";
import { initMinePanel, renderMinePanel } from "./ui/minePanel";
import { initPondArea, renderPondArea } from "./ui/pondArea";
import { initShopModal } from "./ui/shopModal";
import { initTheme } from "./ui/theme";
import { initTreePanel, renderTreePanel } from "./ui/treePanel";
import { initTutorial, renderTutorial } from "./ui/tutorial";
import { showWelcomeBack } from "./ui/welcomeBack";
import { initWorldScene } from "./ui/worldScene";

const storage = window.localStorage;
const state: GameState = load(storage) ?? createInitialState();
const rng: Rng = mulberry32(Date.now() >>> 0);

// Stats snapshot with every streak buff expired, for offline math.
const noBuffStats = () => computeStats(state, Number.MAX_SAFE_INTEGER);

// Offline progress: credit time away if the save is older than a minute.
{
  const awaySec = (Date.now() - state.lastSaved) / 1000;
  if (awaySec > OFFLINE.minGapSec) {
    state.streak.current = 0; // streaks don't survive an absence
    const report = computeOfflineProgress(state, awaySec, noBuffStats());
    if (report.goldGained > 0 || report.xpGained > 0) {
      showWelcomeBack(report);
    }
  }
}

// Dev-only handle for manual verification (PLAN.md §12); stripped from builds.
if (import.meta.env.DEV) {
  (window as unknown as { __cd: { state: GameState } }).__cd = { state };
}

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="hud"></header>
  <main class="world">
    <div class="world-backdrop" id="world-backdrop" aria-hidden="true"></div>
    <section class="world-area area-mine"  id="mine-panel"></section>
    <section class="world-area area-tree"  id="tree-panel"></section>
    <section class="world-area area-pond"  id="pond-area"></section>
    <section class="world-area area-arena" id="arena-panel"></section>
  </main>
`;

initWorldScene(app.querySelector<HTMLElement>("#world-backdrop")!);

const minePanelEl = app.querySelector<HTMLElement>("#mine-panel")!;
const treePanelEl = app.querySelector<HTMLElement>("#tree-panel")!;
const pondAreaEl = app.querySelector<HTMLElement>("#pond-area")!;
const arenaPanelEl = app.querySelector<HTMLElement>("#arena-panel")!;

// Set when importing/resetting so the unload handler can't clobber the
// freshly written (or cleared) save with the in-memory state.
let skipSave = false;

initShopModal(state, rng, {
  onExport: () =>
    navigator.clipboard.writeText(exportSave(state)).then(
      () => true,
      () => false,
    ),
  onImport: () => {
    const json = window.prompt("Paste your exported save JSON:");
    if (!json) return;
    if (importSave(json, storage)) {
      skipSave = true;
      location.reload();
    } else {
      window.alert("That save could not be read.");
    }
  },
  onReset: () => {
    if (!window.confirm("Hard reset? This wipes your ducks, gold, and tree.")) return;
    clearSave(storage);
    skipSave = true;
    location.reload();
  },
});
initInventoryMenu(state);
initItemsMenu(state);
initAchievementsPanel(state);
initCraftingMenu(state, rng);
initExpeditionPanel(state, rng);
initHud(app.querySelector("header.hud")!);
initTheme(state, app.querySelector<HTMLElement>("#hud-theme")!);
initMinePanel(minePanelEl, state);
initTreePanel(treePanelEl, state);
initPondArea(pondAreaEl, state);
initArenaPanel(arenaPanelEl, state);
initFloaters({ mine: minePanelEl, arena: arenaPanelEl });
initTutorial(state);
ensureMissions(state, rng);

function simTick(s: GameState, dt: number, r: Rng): void {
  const stats = refreshStats(s, Date.now());
  tickMine(s, dt, r);
  tickArena(s, dt, r);
  tickPond(s, dt, r, stats);
  checkMissions(s, r);
  checkAchievements(s);
  checkChapterTransition(s);
}

function render(s: GameState): void {
  renderHud(s);
  renderMinePanel(s);
  renderTreePanel(s);
  renderPondArea(s);
  renderArenaPanel(s);
  renderTutorial(s);
}

// Hidden-tab gap: credit expected mine income instead of spinning the
// accumulator — 100% rate for the first 15 minutes, offline rate beyond,
// same 8h cap. The streak does not survive the gap; buff timers expire
// naturally by timestamp.
function handleFrameGap(gapSec: number): void {
  state.streak.current = 0;
  const stats = noBuffStats();
  const { goldPerSec, xpPerSec } = offlineIncomePerSec(state, stats);
  const pond = pondIncomePerSec(state, stats);
  const fullSec = Math.min(gapSec, OFFLINE.fullRateGapSec);
  const beyondSec = Math.min(Math.max(gapSec - fullSec, 0), OFFLINE.capSec);
  const credited = fullSec + beyondSec * stats.offlineRate;
  const cappedGapSec = fullSec + beyondSec; // pond ignores the offline-rate discount
  const gold = goldPerSec * credited + pond.goldPerSec * cappedGapSec;
  state.gold += gold;
  state.lifetime.gold += gold;
  grantXp(state, xpPerSec * credited + pond.xpPerSec * cappedGapSec);
}

let lastFrame = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const realDeltaSeconds = (now - lastFrame) / 1000;
  lastFrame = now;

  if (realDeltaSeconds > FRAME_GAP_THRESHOLD_SEC) {
    accumulator = 0;
    handleFrameGap(realDeltaSeconds);
  } else {
    accumulator = Math.min(accumulator + realDeltaSeconds * gameSpeed(state), MAX_ACCUMULATOR_SEC);
    while (accumulator >= TICK_SEC) {
      simTick(state, TICK_SEC, rng);
      accumulator -= TICK_SEC;
    }
  }

  tickBubbles(state, Date.now(), rng, getStats(state));
  checkExpeditions(state, Date.now());
  render(state);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

const saveNow = () => {
  if (!skipSave) save(state, storage);
};
setInterval(saveNow, AUTOSAVE_INTERVAL_MS);
window.addEventListener("beforeunload", saveNow);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveNow();
});
