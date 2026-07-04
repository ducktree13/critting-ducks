// Circular pond area (Phase F chunk 2, PLAN2.md §10/world redesign): the
// pond's own world-area, extracted out of treePanel.ts's old bottom strip.
// Same init-once/render-per-frame + cache-key pattern as the tree panel's
// pond code it replaces.

import { on } from "../game/events";
import { pondIncomePerSec } from "../game/pond";
import { getStats } from "../game/state";
import type { GameState } from "../game/types";
import { makeDuckDraggable, makeDuckDropTarget } from "./dragDuck";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { fmt } from "./format";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";

let panel: HTMLElement;
let slotsEl: HTMLElement;
let tickerEl: HTMLElement;
let gameState: GameState;
let lastRosterKey = "";

// Up to 5 seats arranged around the pond ellipse (percent-based, over the
// SVG). Ellipse center ~ (50%, 58%); seats ring its edge.
const SEAT_POS: { left: string; top: string }[] = [
  { left: "20%", top: "58%" },
  { left: "38%", top: "78%" },
  { left: "62%", top: "78%" },
  { left: "80%", top: "58%" },
  { left: "50%", top: "38%" },
];

function pondRosterKey(state: GameState): string {
  return state.rosters.pond.join(",") + "|" + getStats(state).pondSlots;
}

// Perspective-ellipse pond SVG: ink ring, mud bank, water fill, an offset
// deep-water ellipse, a few ripple arcs, lily pads + reed clumps.
function pondSvg(): string {
  return `
    <svg class="pond-svg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <ellipse class="pond-ring" cx="180" cy="104" rx="164" ry="86" fill="var(--surface-border)"/>
      <ellipse class="pond-bank" cx="180" cy="102" rx="150" ry="78"
        fill="color-mix(in srgb, var(--surface-border) 30%, var(--ground))"/>
      <ellipse class="pond-water" cx="180" cy="100" rx="132" ry="66" fill="var(--pond-water)"/>
      <ellipse class="pond-water-deep" cx="200" cy="108" rx="76" ry="38" fill="var(--pond-water-deep)"/>

      <path class="pond-ripple" d="M 90 84 Q 130 74 170 84" fill="none" stroke="var(--scene-detail)" stroke-width="2" opacity="0.35"/>
      <path class="pond-ripple" d="M 130 120 Q 175 108 220 120" fill="none" stroke="var(--scene-detail)" stroke-width="2" opacity="0.35"/>
      <path class="pond-ripple" d="M 190 68 Q 225 60 258 70" fill="none" stroke="var(--scene-detail)" stroke-width="2" opacity="0.3"/>

      <g class="pond-reeds">
        <path d="M 44 96 Q 40 70 46 46 M 50 98 Q 48 74 56 52 M 58 100 Q 58 78 66 58"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
        <path d="M 292 110 Q 298 84 292 60 M 300 112 Q 308 88 302 64"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
      </g>

      <g class="pond-lilies">
        <path class="lily" d="M 118 138 a 16 10 0 1 0 0.1 0 M 118 138 L 134 132" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 232 74 a 13 8 0 1 0 0.1 0 M 232 74 L 244 70" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 150 60 a 11 7 0 1 0 0.1 0" fill="var(--foliage-deep)" stroke="var(--surface-border)" stroke-width="1.5"/>
      </g>
    </svg>
  `;
}

function slotHtml(state: GameState, i: number): string {
  const seat = SEAT_POS[i % SEAT_POS.length];
  const defId = state.rosters.pond[i];
  const style = `left:${seat.left};top:${seat.top};`;
  if (defId) {
    const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
    return `
      <div class="pond-seat occupied" data-slot="${i}" data-duck="${defId}" style="${style}">
        <span class="pond-seat-ripple"></span>
        ${duckSvg(defId, 44, { ascension, ringed: false })}
      </div>`;
  }
  return `
    <div class="pond-seat empty" data-slot="${i}" style="${style}" title="Assign a duck to swim">
      <span class="pond-seat-plus">+</span>
    </div>`;
}

function rebuildRoster(state: GameState): void {
  const stats = getStats(state);
  const html: string[] = [];
  for (let i = 0; i < stats.pondSlots; i++) html.push(slotHtml(state, i));
  slotsEl.innerHTML = html.join("");

  slotsEl.querySelectorAll<HTMLElement>(".pond-seat").forEach((slot, idx) => {
    // Stagger the swim-sway animation per seat so ducks don't move in lockstep.
    slot.style.animationDuration = `${3.2 + (idx % 3) * 0.6}s`;
    slot.style.animationDelay = `${(idx % 4) * -0.4}s`;
    slot.addEventListener("click", () => openRosterPicker(state, "pond", Number(slot.dataset.slot)));
    const defId = slot.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(slot, () => duckTooltipHtml(state, duck));
      makeDuckDraggable(slot, defId, state);
    }
    makeDuckDropTarget(slot, "pond", Number(slot.dataset.slot), state);
  });

  lastRosterKey = pondRosterKey(state);
}

export function initPondArea(el: HTMLElement, state: GameState): void {
  panel = el;
  gameState = state;
  panel.innerHTML = `
    <div class="area-chip">Pond</div>
    <div class="panel-body pond-body">
      <div class="pond-scene">
        ${pondSvg()}
        <div class="pond-ducks" id="pond-ducks"></div>
      </div>
      <div class="well pond-income-chip" id="pond-income-chip">
        <small id="pond-ticker"></small>
      </div>
    </div>
  `;
  slotsEl = panel.querySelector<HTMLElement>("#pond-ducks")!;
  tickerEl = panel.querySelector<HTMLElement>("#pond-ticker")!;

  on("roster", () => rebuildRoster(gameState));

  rebuildRoster(state);
}

export function renderPondArea(state: GameState): void {
  if (pondRosterKey(state) !== lastRosterKey) rebuildRoster(state);
  const income = pondIncomePerSec(state, getStats(state));
  tickerEl.textContent = income.goldPerSec > 0 ? `${fmt(income.goldPerSec * 3600)}/hr` : "idle";
}
