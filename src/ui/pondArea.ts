// Circular pond area (Phase F chunk 2, PLAN2.md §10/world redesign): the
// pond's own world-area, extracted out of treePanel.ts's old bottom strip.
// Same init-once/render-per-frame + cache-key pattern as the tree panel's
// pond code it replaces.
//
// Phase R3 adds the pond-bubbles reward system (replacing the old falling
// tree-leaves): a pool of up to 3 bubble buttons float on the water surface;
// popping one stages a duck "paddling" out to collect it — either the
// nearest occupied pond-seat duck, or (if the pond roster is empty) a
// fabricated bench duck that fades in just for the collection. Reward
// numbers use a small one-off floater local to this module rather than
// extending src/ui/floaters.ts, since that module's pool is wired directly
// to the "hit" event's mine/arena panel shape and bubbles have no such event.

import { isDuckOnExpedition } from "../game/expeditions";
import { on } from "../game/events";
import { popBubble } from "../game/bubbles";
import { pondIncomePerSec } from "../game/pond";
import { getStats } from "../game/state";
import type { GameState, PondBubble } from "../game/types";
import { makeDuckDraggable, makeDuckDropTarget } from "./dragDuck";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { fmt } from "./format";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";

let panel: HTMLElement;
let slotsEl: HTMLElement;
let bubblesEl: HTMLElement;
let tickerEl: HTMLElement;
let gameState: GameState;
let lastRosterKey = "";

const reducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BUBBLE_POOL_SIZE = 3;
const PADDLE_LIFE_MS = 600;
const FLOATER_LIFE_MS = 640;
const BENCH_DUCK_LIFE_MS = 900; // fade-in + paddle + fade-out for a fabricated bench duck

interface BubbleSlot {
  el: HTMLButtonElement;
  bubbleId: string | null;
}
let bubblePool: BubbleSlot[] = [];

// Two tiny ink-outlined fish shapes, cycled per pop for a little variety.
const FISH_SHAPES = [
  `<path d="M2 6 Q7 1 13 3 L16 0 L15 3.5 L18 4 L15 5 L16 8.5 L13 5.5 Q7 8 2 6 Z"/>`,
  `<path d="M2 5 Q8 0 14 2.5 L17 -0.5 L16.5 3 L19 4 L16.5 5 L17 8.5 L14 5.5 Q8 8.5 2 5 Z"/>`,
];
let fishCycle = 0;

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
// deep-water ellipse, a few ripple arcs, lily pads + reed clumps, and a
// shore/bank transition along the top edge (Phase R3) that echoes the tree
// area's grass-mound tones (--ground/--foliage-deep) so the two scenes read
// as one continuous ground plane.
function pondSvg(): string {
  return `
    <svg class="pond-svg" viewBox="0 0 360 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path class="pond-shore" d="M 0 0 L 360 0 L 360 40 C 300 62 260 30 200 46 C 140 62 90 26 40 44 C 22 51 8 46 0 40 Z"/>
      <path class="pond-shore-edge" d="M 0 40 C 40 44 90 26 140 42 C 190 58 230 34 280 42 C 310 47 340 40 360 32"/>
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

// Deterministic per-id hash (FNV-1a-ish), so a bubble's on-water position and
// its fish-arc target stay stable across re-renders while it's alive.
function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 10000;
}

// Places a bubble somewhere on the open water, inside the pond ellipse and
// clear of the seat ring (percent-based, matching SEAT_POS's coordinate
// space). Deterministic per bubble id.
function bubblePosition(id: string): { left: string; top: string } {
  const h = hashId(id);
  const left = 32 + (h % 37); // 32%..68%
  const top = 42 + ((h >> 4) % 28); // 42%..69%
  return { left: `${left}%`, top: `${top}%` };
}

function bubbleClass(bubble: PondBubble): string {
  return bubble.kind === "duck" ? "pond-bubble rare" : "pond-bubble";
}

function ensureBubblePool(): void {
  if (bubblePool.length > 0) return;
  bubblePool = Array.from({ length: BUBBLE_POOL_SIZE }, () => {
    const el = document.createElement("button");
    el.className = "pond-bubble";
    el.style.display = "none";
    bubblesEl.appendChild(el);
    return { el, bubbleId: null };
  });
}

// Finds the pond-seat element nearest (in percent-space) to a target point,
// among currently-occupied seats. Returns null if the pond roster is empty.
function nearestOccupiedSeat(x: number, y: number): { el: HTMLElement; defId: string } | null {
  let best: { el: HTMLElement; defId: string; d: number } | null = null;
  slotsEl.querySelectorAll<HTMLElement>(".pond-seat.occupied").forEach((seatEl) => {
    const defId = seatEl.dataset.duck;
    if (!defId) return;
    const left = parseFloat(seatEl.style.left) || 0;
    const top = parseFloat(seatEl.style.top) || 0;
    const d = Math.hypot(left - x, top - y);
    if (!best || d < best.d) best = { el: seatEl, defId, d };
  });
  return best;
}

// The first owned duck sitting on no roster and no expedition ("bench"),
// used to fabricate a temporary collector when the pond roster is empty.
function firstBenchDuck(state: GameState): string | null {
  const rostered = new Set([...state.rosters.mine, ...state.rosters.arena, ...state.rosters.pond]);
  const bench = state.ducks.find((d) => !rostered.has(d.defId) && !isDuckOnExpedition(state, d.defId));
  return bench?.defId ?? (state.ducks.some((d) => d.defId === "bill") ? "bill" : null);
}

function fishSvg(): string {
  const shape = FISH_SHAPES[fishCycle % FISH_SHAPES.length];
  fishCycle++;
  return `<svg class="pond-fish-pop" viewBox="-2 -3 22 12" width="26" height="14">${shape}</svg>`;
}

// Spawns a small one-off "+N" reward number anchored over the pond scene at
// a percent position. Not pooled like src/ui/floaters.ts (bubbles are rare
// enough — at most 1 in flight — that per-pop DOM churn here is fine).
function spawnRewardFloater(text: string, isCrit: boolean, leftPct: number, topPct: number): void {
  const el = document.createElement("div");
  el.className = `floater pond-floater${isCrit ? " crit" : ""}`;
  el.style.left = `${leftPct}%`;
  el.style.top = `${topPct}%`;
  el.textContent = text;
  panel.querySelector(".pond-scene")!.appendChild(el);
  el.classList.add("anim");
  if (reducedMotion) {
    el.remove();
    return;
  }
  window.setTimeout(() => el.remove(), FLOATER_LIFE_MS);
}

// Stages the "duck paddles out to collect" moment for a just-popped bubble:
// the nearest occupied pond-seat duck paddles toward the bubble and back; if
// the pond has no occupied seats, a fabricated bench duck fades in near the
// pond edge, paddles, and fades out afterward. Reduced motion skips the
// animation and just pops the reward instantly (still via spawnRewardFloater
// so the number itself always shows).
function stageCollection(state: GameState, leftPct: number, topPct: number): void {
  const seat = nearestOccupiedSeat(leftPct, topPct);

  if (seat) {
    if (!reducedMotion) {
      const dx = leftPct - (parseFloat(seat.el.style.left) || 0);
      const dy = topPct - (parseFloat(seat.el.style.top) || 0);
      seat.el.style.setProperty("--paddle-dx", `${dx}%`);
      seat.el.style.setProperty("--paddle-dy", `${dy}%`);
      seat.el.classList.remove("paddle-to");
      void seat.el.offsetWidth;
      seat.el.classList.add("paddle-to");
      window.setTimeout(() => seat.el.classList.remove("paddle-to"), PADDLE_LIFE_MS);
    }
    spawnFishPop(leftPct, topPct);
    return;
  }

  // No occupied seats: fabricate a temporary bench duck near the pond edge.
  const defId = firstBenchDuck(state);
  if (!defId || reducedMotion) {
    spawnFishPop(leftPct, topPct);
    return;
  }
  const temp = document.createElement("div");
  temp.className = "pond-seat pond-bench-duck";
  temp.style.left = "50%";
  temp.style.top = "88%";
  const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
  temp.innerHTML = duckSvg(defId, 40, { ascension, ringed: false });
  bubblesEl.appendChild(temp);

  const dx = leftPct - 50;
  const dy = topPct - 88;
  temp.style.setProperty("--paddle-dx", `${dx}%`);
  temp.style.setProperty("--paddle-dy", `${dy}%`);
  requestAnimationFrame(() => {
    temp.classList.add("fade-in", "paddle-to");
  });
  spawnFishPop(leftPct, topPct);
  window.setTimeout(() => {
    temp.classList.add("fade-out");
    window.setTimeout(() => temp.remove(), 300);
  }, BENCH_DUCK_LIFE_MS);
}

function spawnFishPop(leftPct: number, topPct: number): void {
  if (reducedMotion) return;
  const el = document.createElement("div");
  el.className = "pond-fish-wrap";
  el.style.left = `${leftPct}%`;
  el.style.top = `${topPct}%`;
  el.innerHTML = fishSvg();
  bubblesEl.appendChild(el);
  window.setTimeout(() => el.remove(), 700);
}

function popRewardText(bubble: PondBubble): string {
  if (bubble.kind === "duck") return "Duck Tree!";
  return `+${fmt(bubble.amount)}${bubble.isCrit ? "!" : ""}`;
}

function onBubbleClick(state: GameState, slot: BubbleSlot): void {
  const bubbleId = slot.bubbleId;
  if (!bubbleId) return;
  const bubble = state.bubbles.find((b) => b.id === bubbleId);
  if (!bubble) return;
  const leftPct = parseFloat(slot.el.style.left) || 50;
  const topPct = parseFloat(slot.el.style.top) || 50;

  if (!popBubble(state, bubbleId)) return;

  slot.el.style.display = "none";
  slot.bubbleId = null;

  stageCollection(state, leftPct, topPct);
  spawnRewardFloater(popRewardText(bubble), bubble.isCrit, leftPct, topPct);
}

// Assigns each live bubble to a pooled button (stable per bubble id while
// it's alive), hides pool slots with no current bubble.
function renderBubbles(state: GameState): void {
  ensureBubblePool();
  const live = state.bubbles.slice(0, bubblePool.length);
  const liveIds = new Set(live.map((b) => b.id));

  // Free slots whose bubble popped/expired.
  for (const slot of bubblePool) {
    if (slot.bubbleId && !liveIds.has(slot.bubbleId)) {
      slot.el.style.display = "none";
      slot.bubbleId = null;
    }
  }

  for (const bubble of live) {
    let slot = bubblePool.find((s) => s.bubbleId === bubble.id);
    if (!slot) {
      slot = bubblePool.find((s) => s.bubbleId === null);
      if (!slot) continue;
      slot.bubbleId = bubble.id;
      const pos = bubblePosition(bubble.id);
      slot.el.style.left = pos.left;
      slot.el.style.top = pos.top;
      slot.el.className = bubbleClass(bubble);
      slot.el.style.animationDelay = `${(hashId(bubble.id) % 20) / 10}s`;
      slot.el.onclick = () => onBubbleClick(gameState, slot!);
      slot.el.style.display = "";
    }
  }
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
        <div class="pond-bubbles" id="pond-bubbles"></div>
      </div>
      <div class="pond-income-chip" id="pond-income-chip">
        <small id="pond-ticker"></small>
      </div>
    </div>
  `;
  slotsEl = panel.querySelector<HTMLElement>("#pond-ducks")!;
  bubblesEl = panel.querySelector<HTMLElement>("#pond-bubbles")!;
  tickerEl = panel.querySelector<HTMLElement>("#pond-ticker")!;

  on("roster", () => rebuildRoster(gameState));

  rebuildRoster(state);
}

export function renderPondArea(state: GameState): void {
  if (pondRosterKey(state) !== lastRosterKey) rebuildRoster(state);
  const income = pondIncomePerSec(state, getStats(state));
  tickerEl.textContent = income.goldPerSec > 0 ? `${fmt(income.goldPerSec * 3600)}/hr` : "idle";
  renderBubbles(state);
}
