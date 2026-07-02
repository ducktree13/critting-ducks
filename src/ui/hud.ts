import { on } from "../game/events";
import { RateTracker } from "../game/rates";
import { xpToNext } from "../game/state";
import type { GameState } from "../game/types";
import { fmt } from "./format";

const goldRate = new RateTracker();
const xpRate = new RateTracker();

let goldEl: HTMLElement;
let goldRateEl: HTMLElement;
let xpFillEl: HTMLElement;
let xpLabelEl: HTMLElement;
let xpRateEl: HTMLElement;
let streakEl: HTMLElement;

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
    </div>
    <div class="hud-right">
      <span class="hud-title">Critting Ducks</span>
    </div>
  `;

  goldEl = header.querySelector("#hud-gold-amount")!;
  goldRateEl = header.querySelector("#hud-gold-rate")!;
  xpFillEl = header.querySelector("#hud-xp-fill")!;
  xpLabelEl = header.querySelector("#hud-xp-label")!;
  xpRateEl = header.querySelector("#hud-xp-rate")!;
  streakEl = header.querySelector("#hud-streak")!;

  on("hit", (e) => {
    const now = Date.now();
    goldRate.add(now, e.gold);
    xpRate.add(now, e.xp);
  });
}

export function renderHud(state: GameState): void {
  const now = Date.now();
  goldEl.textContent = fmt(state.gold);
  goldRateEl.textContent = `${fmt(goldRate.perHour(now))}/hr`;
  const need = xpToNext(state.level);
  xpFillEl.style.width = `${Math.min((state.xp / need) * 100, 100)}%`;
  xpLabelEl.textContent = `Lv ${state.level}`;
  xpRateEl.textContent = `${fmt(xpRate.perHour(now))} xp/hr`;
  streakEl.textContent = String(state.streak.current);
}
