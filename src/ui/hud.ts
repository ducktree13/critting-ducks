import { STREAK_BALANCE } from "../game/balance";
import { on } from "../game/events";
import { RateTracker } from "../game/rates";
import { getStats, xpToNext } from "../game/state";
import type { GameState } from "../game/types";
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

const goldRate = new RateTracker();
const xpRate = new RateTracker();

let goldEl: HTMLElement;
let goldRateEl: HTMLElement;
let xpFillEl: HTMLElement;
let xpLabelEl: HTMLElement;
let xpRateEl: HTMLElement;
let streakEl: HTMLElement;
let pipEls: HTMLElement[] = [];
let latestState: GameState | null = null;

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
      <span class="hud-streak" id="hud-streak">0</span>
      <span class="streak-pips" id="streak-pips">
        ${TIER_KEYS.map((k) => `<span class="pip" data-tier="${k}">${STREAK_BALANCE.tiers[k]}</span>`).join("")}
      </span>
    </div>
    <div class="hud-right">
      <button class="shop-btn" id="hud-ducks">Ducks</button>
      <button class="shop-btn" id="hud-shop">Shop</button>
      <button class="icon-btn" id="hud-theme" aria-label="Toggle dark mode"></button>
      <span class="hud-title">Critting Ducks</span>
    </div>
  `;

  header.querySelector("#hud-shop")!.addEventListener("click", openShop);
  header.querySelector("#hud-ducks")!.addEventListener("click", openInventory);

  goldEl = header.querySelector("#hud-gold-amount")!;
  goldRateEl = header.querySelector("#hud-gold-rate")!;
  xpFillEl = header.querySelector("#hud-xp-fill")!;
  xpLabelEl = header.querySelector("#hud-xp-label")!;
  xpRateEl = header.querySelector("#hud-xp-rate")!;
  streakEl = header.querySelector("#hud-streak")!;
  pipEls = Array.from(header.querySelectorAll<HTMLElement>(".pip"));
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

export function renderHud(state: GameState): void {
  latestState = state;
  const now = Date.now();
  goldEl.textContent = fmt(state.gold);
  goldRateEl.textContent = `${fmt(goldRate.perHour(now))}/hr`;
  const need = xpToNext(state.level);
  xpFillEl.style.width = `${Math.min((state.xp / need) * 100, 100)}%`;
  xpLabelEl.textContent = `Lv ${state.level}`;
  xpRateEl.textContent = `${fmt(xpRate.perHour(now))} xp/hr`;
  streakEl.textContent = String(state.streak.current);
  streakEl.classList.toggle("hot", state.streak.current > 0);

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
