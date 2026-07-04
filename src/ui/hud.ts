import { STREAK_BALANCE } from "../game/balance";
import { on } from "../game/events";
import { offlineIncomePerSec } from "../game/offline";
import { pondIncomePerSec } from "../game/pond";
import { RateTracker } from "../game/rates";
import { getStats, xpToNext } from "../game/state";
import { gameSpeed } from "../game/streak";
import type { GameState } from "../game/types";
import { openAchievements } from "./achievementsPanel";
import { openCrafting } from "./craftingMenu";
import { openExpeditions } from "./expeditionPanel";
import { fmt } from "./format";
import { openInventory } from "./inventoryMenu";
import { openShop } from "./shopModal";
import { attachTooltip } from "./tooltip";

type TierKey = keyof typeof STREAK_BALANCE.tiers;
const TIER_KEYS: TierKey[] = ["t10", "t25", "t50", "t100"];

const TIER_INFO: Record<TierKey, { name: string; desc: string }> = {
  t10: { name: "Gold Rush", desc: "+50% gold income" },
  t25: { name: "Enlightened", desc: "+50% XP gain" },
  t50: { name: "Bloodlust", desc: "+50% arena attack damage" },
  t100: { name: "QUACKENING", desc: "+25% to all stats, +10% crit chance, free packs" },
};

// Heat ladder (design/STYLE.md §7). Ordered low -> high; `min` is the streak
// value at which the state begins.
type HeatState = "cold" | "warm" | "hot" | "blazing" | "quackening";
const HEAT_BANDS: { state: HeatState; min: number }[] = [
  { state: "cold", min: 0 },
  { state: "warm", min: 10 },
  { state: "hot", min: 25 },
  { state: "blazing", min: 50 },
  { state: "quackening", min: 100 },
];

function heatForStreak(streak: number): HeatState {
  let result: HeatState = "cold";
  for (const band of HEAT_BANDS) {
    if (streak >= band.min) result = band.state;
  }
  return result;
}

// Embers/sec per heat state (design §7). Cold/Warm have none; states below
// scale toward "max particles" at QUACKENING.
const EMBER_RATE_PER_SEC: Record<HeatState, number> = {
  cold: 0,
  warm: 0,
  hot: 2,
  blazing: 6,
  quackening: 10,
};

const EMBER_POOL_SIZE = 16;
const RING_BURST_POOL_SIZE = 24; // 2 bursts' worth of 12-particle tier rings
const CONFETTI_POOL_SIZE = 20;

const reducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const goldRate = new RateTracker();
const xpRate = new RateTracker();

let goldEl: HTMLElement;
let goldRateEl: HTMLElement;
let xpFillEl: HTMLElement;
let xpLabelEl: HTMLElement;
let xpRateEl: HTMLElement;
let streakEl: HTMLElement;
let streakWrapEl: HTMLElement;
let pipEls: HTMLElement[] = [];
let latestState: GameState | null = null;

let emberPool: HTMLElement[] = [];
let emberCursor = 0;
let ringBurstPool: HTMLElement[] = [];
let ringBurstCursor = 0;
let confettiPool: HTMLElement[] = [];
let confettiCursor = 0;

let panelsEl: HTMLElement | null = null;
let flashEl: HTMLElement | null = null;
let bannerEl: HTMLElement | null = null;
let sceneEls: HTMLElement[] | null = null;
let lastSceneHot: boolean | null = null;

// Edge-detection state, compared every renderHud() frame.
let prevStreak = 0;
let prevHeat: HeatState = "cold";
let quackeningActive = false;

let emberAccumulator = 0;
let lastEmberTs = 0;

// Gate textContent/style writes on the formatted string actually changing —
// some engines invalidate layout on any textContent assignment even when the
// new value equals the old one, and these run every rAF frame.
let lastGoldText = "";
let lastGoldRateText = "";
let lastXpWidth = "";
let lastXpLabelText = "";
let lastXpRateText = "";
let lastStreakText = "";

function buildParticleLayers(): void {
  // Ember layer, parked on the streak wrapper.
  emberPool = Array.from({ length: EMBER_POOL_SIZE }, () => {
    const el = document.createElement("div");
    el.className = "heat-ember";
    el.style.display = "none";
    streakWrapEl.appendChild(el);
    return el;
  });

  // Ring-burst particles for tier crosses, parked on the streak wrapper.
  ringBurstPool = Array.from({ length: RING_BURST_POOL_SIZE }, () => {
    const el = document.createElement("div");
    el.className = "tier-burst-particle";
    el.style.display = "none";
    streakWrapEl.appendChild(el);
    return el;
  });

  // Golden-duck confetti, parked on <body> so it can fall across the HUD.
  confettiPool = Array.from({ length: CONFETTI_POOL_SIZE }, () => {
    const el = document.createElement("div");
    el.className = "quackening-confetti";
    el.style.display = "none";
    document.body.appendChild(el);
    return el;
  });

  // Full-viewport white flash overlay for THE QUACKENING.
  flashEl = document.createElement("div");
  flashEl.className = "quackening-flash";
  document.body.appendChild(flashEl);

  // QUACKENING banner.
  bannerEl = document.createElement("div");
  bannerEl.className = "quackening-banner";
  bannerEl.textContent = "THE QUACKENING";
  document.body.appendChild(bannerEl);
}

export function initHud(header: HTMLElement): void {
  header.innerHTML = `
    <div class="hud-left">
      <span class="hud-gold">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-label="gold">
          <circle cx="12" cy="12" r="10" fill="#f5c518" stroke="#c99700" stroke-width="2"/>
          <path d="M8 13 q4 -4 8 0 q-3 4 -8 0 z" fill="#c99700"/>
        </svg>
        <b id="hud-gold-amount">0</b>
      </span>
      <span class="hud-rate" id="hud-gold-rate">0/hr</span>
      <span class="hud-xp">
        <span class="xp-bar"><span class="xp-fill" id="hud-xp-fill"></span></span>
        <span id="hud-xp-label">Lv 1</span>
      </span>
      <span class="hud-rate" id="hud-xp-rate">0 xp/hr</span>
    </div>
    <div class="hud-center">
      <span class="streak-wrap" id="streak-wrap" data-heat="cold">
        <span class="hud-streak" id="hud-streak">0</span>
        <span class="streak-pips" id="streak-pips">
          ${TIER_KEYS.map((k) => `<span class="pip" data-tier="${k}">${STREAK_BALANCE.tiers[k]}</span>`).join("")}
        </span>
      </span>
    </div>
    <div class="hud-right">
      <button class="shop-btn" id="hud-achievements">Achievements</button>
      <button class="shop-btn" id="hud-craft">Craft</button>
      <button class="shop-btn" id="hud-expeditions">Expeditions</button>
      <button class="shop-btn" id="hud-ducks">Ducks</button>
      <button class="shop-btn" id="hud-shop">Shop</button>
      <button class="icon-btn" id="hud-theme" aria-label="Toggle dark mode"></button>
      <span class="hud-title">Critting Ducks</span>
    </div>
  `;

  header.querySelector("#hud-shop")!.addEventListener("click", openShop);
  header.querySelector("#hud-ducks")!.addEventListener("click", openInventory);
  header.querySelector("#hud-achievements")!.addEventListener("click", openAchievements);
  header.querySelector("#hud-craft")!.addEventListener("click", openCrafting);
  header.querySelector("#hud-expeditions")!.addEventListener("click", openExpeditions);

  goldEl = header.querySelector("#hud-gold-amount")!;
  goldRateEl = header.querySelector("#hud-gold-rate")!;
  xpFillEl = header.querySelector("#hud-xp-fill")!;
  xpLabelEl = header.querySelector("#hud-xp-label")!;
  xpRateEl = header.querySelector("#hud-xp-rate")!;
  streakWrapEl = header.querySelector("#streak-wrap")!;
  streakEl = header.querySelector("#hud-streak")!;
  pipEls = Array.from(header.querySelectorAll<HTMLElement>(".pip"));

  panelsEl = document.querySelector<HTMLElement>("main.world");

  buildParticleLayers();

  attachTooltip(goldEl, () => goldTooltipHtml());

  for (const pip of pipEls) {
    const tier = pip.dataset.tier as TierKey;
    attachTooltip(pip, () => {
      const info = TIER_INFO[tier];
      const remainingMs = latestState ? latestState.streak.buffExpiry[tier] - Date.now() : 0;
      const status =
        remainingMs > 0 ? `Active — ${(remainingMs / 1000).toFixed(1)}s left` : "Not active";
      return `<b>${info.name}</b> (${STREAK_BALANCE.tiers[tier]}-streak)<div class="tt-meta">${info.desc}</div><div class="tt-meta">${status}</div>`;
    });
  }

  on("wave", (e) => {
    const now = Date.now();
    goldRate.add(now, e.gold);
    xpRate.add(now, e.xp);
  });

  on("hit", (e) => {
    const now = Date.now();
    goldRate.add(now, e.gold);
    xpRate.add(now, e.xp);
    if (e.isCrit) {
      streakEl.classList.remove("pulse");
      void streakEl.offsetWidth;
      streakEl.classList.add("pulse");
    }
  });
}

// ---- particle helpers (transform/opacity only, §8) ----

function spawnEmber(): void {
  if (reducedMotion) return;
  const el = emberPool[emberCursor];
  emberCursor = (emberCursor + 1) % emberPool.length;
  const drift = (Math.random() - 0.5) * 24;
  el.style.setProperty("--drift", `${drift}px`);
  el.style.left = `${40 + Math.random() * 20}%`;
  el.style.display = "";
  el.classList.remove("anim");
  void el.offsetWidth;
  el.classList.add("anim");
  window.setTimeout(() => {
    el.classList.remove("anim");
    el.style.display = "none";
  }, 900);
}

function spawnTierBurst(): void {
  if (reducedMotion) return;
  for (let i = 0; i < 12; i++) {
    const el = ringBurstPool[ringBurstCursor];
    ringBurstCursor = (ringBurstCursor + 1) % ringBurstPool.length;
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 34 + Math.random() * 10;
    el.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    el.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    el.style.display = "";
    el.classList.remove("anim");
    void el.offsetWidth;
    el.classList.add("anim");
    window.setTimeout(() => {
      el.classList.remove("anim");
      el.style.display = "none";
    }, 500);
  }
}

function spawnConfettiBurst(): void {
  if (reducedMotion) return;
  for (let i = 0; i < CONFETTI_POOL_SIZE; i++) {
    const el = confettiPool[confettiCursor];
    confettiCursor = (confettiCursor + 1) % confettiPool.length;
    el.style.left = `${Math.random() * 100}%`;
    el.style.setProperty("--fall-delay", `${Math.random() * 400}ms`);
    el.style.setProperty("--drift", `${(Math.random() - 0.5) * 120}px`);
    el.style.display = "";
    el.classList.remove("anim");
    void el.offsetWidth;
    el.classList.add("anim");
    window.setTimeout(() => {
      el.classList.remove("anim");
      el.style.display = "none";
    }, 2600);
  }
}

function triggerScreenShake(durationMs: number): void {
  if (reducedMotion || !panelsEl) return;
  panelsEl.classList.remove("streak-shake");
  void panelsEl.offsetWidth;
  panelsEl.classList.add("streak-shake");
  window.setTimeout(() => panelsEl!.classList.remove("streak-shake"), durationMs);
}

function triggerTierCross(): void {
  streakWrapEl.classList.remove("tier-pop");
  void streakWrapEl.offsetWidth;
  streakWrapEl.classList.add("tier-pop");
  window.setTimeout(() => streakWrapEl.classList.remove("tier-pop"), 280);
  triggerScreenShake(220);
  spawnTierBurst();
}

function triggerQuackeningEnter(): void {
  if (!reducedMotion && flashEl) {
    flashEl.classList.remove("anim");
    void flashEl.offsetWidth;
    flashEl.classList.add("anim");
    window.setTimeout(() => flashEl!.classList.remove("anim"), 120);
  }
  triggerScreenShake(400);
  if (bannerEl) {
    bannerEl.classList.remove("anim");
    void bannerEl.offsetWidth;
    bannerEl.classList.add("anim");
    window.setTimeout(() => bannerEl!.classList.remove("anim"), 900);
  }
  spawnConfettiBurst();
  document.body.classList.add("quackening-active");
  if (panelsEl) panelsEl.classList.add("quackening-active");
}

function triggerQuackeningExit(): void {
  document.body.classList.remove("quackening-active");
  if (panelsEl) panelsEl.classList.remove("quackening-active");
}

function triggerStreakBreak(): void {
  streakWrapEl.classList.remove("streak-break");
  void streakWrapEl.offsetWidth;
  streakWrapEl.classList.add("streak-break");
  window.setTimeout(() => streakWrapEl.classList.remove("streak-break"), 600);
}

// Gold breakdown by source, re-evaluated on each hover (pattern matches the
// pip tooltips: pull the latest state via `latestState`, not a captured ref).
function goldTooltipHtml(): string {
  if (!latestState) return "";
  const state = latestState;
  const stats = getStats(state);
  const mine = offlineIncomePerSec(state, stats).goldPerSec * 3600;
  const pond = pondIncomePerSec(state, stats).goldPerSec * 3600;
  const total = mine + pond;
  const rushActive = state.streak.buffExpiry.t10 > Date.now();
  return `<b>Gold income</b><div class="tt-stats">Mine: ${fmt(mine)}/hr<br>Pond: ${fmt(pond)}/hr<br>Total: ${fmt(total)}/hr${
    rushActive ? `<br><span class="tt-meta">+50% Gold Rush active</span>` : ""
  }</div>`;
}

export function renderHud(state: GameState): void {
  latestState = state;
  const now = Date.now();

  const goldText = fmt(state.gold);
  if (goldText !== lastGoldText) {
    goldEl.textContent = goldText;
    lastGoldText = goldText;
  }
  const goldRateText = `${fmt(goldRate.perHour(now))}/hr`;
  if (goldRateText !== lastGoldRateText) {
    goldRateEl.textContent = goldRateText;
    lastGoldRateText = goldRateText;
  }
  const need = xpToNext(state.level);
  const xpWidth = `${Math.min((state.xp / need) * 100, 100)}%`;
  if (xpWidth !== lastXpWidth) {
    xpFillEl.style.width = xpWidth;
    lastXpWidth = xpWidth;
  }
  const xpLabelText = `Lv ${state.level}`;
  if (xpLabelText !== lastXpLabelText) {
    xpLabelEl.textContent = xpLabelText;
    lastXpLabelText = xpLabelText;
  }
  const xpRateText = `${fmt(xpRate.perHour(now))} xp/hr`;
  if (xpRateText !== lastXpRateText) {
    xpRateEl.textContent = xpRateText;
    lastXpRateText = xpRateText;
  }
  const streakText = String(state.streak.current);
  if (streakText !== lastStreakText) {
    streakEl.textContent = streakText;
    lastStreakText = streakText;
  }
  streakEl.classList.toggle("hot", state.streak.current > 0);

  const streak = state.streak.current;
  const heat = heatForStreak(streak);

  // ---- edge detection (crossings fire exactly once, per §7) ----
  const tierCrossed = TIER_KEYS.some(
    (k) => prevStreak < STREAK_BALANCE.tiers[k] && streak >= STREAK_BALANCE.tiers[k],
  );
  if (tierCrossed) triggerTierCross();

  if (heat !== prevHeat) {
    // Heat shift retint — handled by the CSS transition on data-heat change,
    // just flag it so the transition isn't skipped by a duplicate write.
    streakWrapEl.dataset.heatPrev = prevHeat;
  }

  const enteringQuackening = heat === "quackening" && !quackeningActive;
  const exitingQuackening = heat !== "quackening" && quackeningActive;
  if (enteringQuackening) {
    quackeningActive = true;
    triggerQuackeningEnter();
  } else if (exitingQuackening) {
    quackeningActive = false;
    triggerQuackeningExit();
  }

  const streakBroke = prevStreak >= STREAK_BALANCE.tiers.t10 && streak === 0;
  if (streakBroke) triggerStreakBreak();

  streakWrapEl.dataset.heat = heat;
  const speed2x = gameSpeed(state) >= 2;
  streakWrapEl.classList.toggle("speed-2x", speed2x);

  // Blazing+: +6% scene saturation, applied to the scene layers only (never
  // the whole page) per §7/§8. Queried lazily (not cached at init) since the
  // mine/arena panels populate .mine-scene/.arena-scene after initHud runs.
  // .mine-scene/.arena-scene are queried lazily (not cached at init, since
  // the mine/arena panels populate them after initHud runs) but the query
  // result itself is stable afterward, so cache it on first lookup and only
  // touch classList when the hot/cold state actually flips.
  const sceneHot = heat === "blazing" || heat === "quackening";
  if (sceneHot !== lastSceneHot) {
    if (!sceneEls) sceneEls = Array.from(document.querySelectorAll<HTMLElement>(".mine-scene, .arena-scene"));
    for (const scene of sceneEls) scene.classList.toggle("heat-saturate", sceneHot);
    lastSceneHot = sceneHot;
  }

  prevStreak = streak;
  prevHeat = heat;

  // Ember spawn rate for the current heat state, scaled by real elapsed time.
  const rate = EMBER_RATE_PER_SEC[heat];
  if (lastEmberTs === 0) lastEmberTs = now;
  const dt = (now - lastEmberTs) / 1000;
  lastEmberTs = now;
  if (rate > 0 && !reducedMotion) {
    emberAccumulator += rate * dt;
    while (emberAccumulator >= 1) {
      spawnEmber();
      emberAccumulator -= 1;
    }
  } else {
    emberAccumulator = 0;
  }

  // Tier pips light while their buff is active, with a radial countdown.
  const durationMs = getStats(state).buffDurationSec * 1000;
  for (const pip of pipEls) {
    const tier = pip.dataset.tier as TierKey;
    const remaining = state.streak.buffExpiry[tier] - now;
    if (remaining > 0) {
      pip.classList.add("lit");
      const frac = Math.min(remaining / durationMs, 1);
      pip.style.background = `conic-gradient(var(--accent) ${frac * 360}deg, var(--card-border) 0deg)`;
    } else {
      pip.classList.remove("lit");
      pip.style.background = "";
    }
  }
}
