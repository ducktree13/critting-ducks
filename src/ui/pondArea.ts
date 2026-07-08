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
let sceneEl: HTMLElement;
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

// Empty "+" slots dock along the near shore (bottom-left) — an assignment
// affordance, not a swim position. OCCUPIED ducks are free-roaming swimmers
// that wander waypoints across the whole lake (see the waypoint system below).
const EMPTY_DOCK_POS: { left: string; top: string }[] = [
  { left: "10%", top: "88%" },
  { left: "19%", top: "92%" },
  { left: "28%", top: "88%" },
  { left: "37%", top: "92%" },
  { left: "46%", top: "88%" },
];

// Exclusion zones in percent-space of the pond scene (the lake SVG stretches
// to fill the box with preserveAspectRatio="none", so viewBox coords map
// linearly to percents: x/4, y/2). Swimmers and bubbles avoid all of these:
// the island, and each obstacle on the water (lily pads at 48/66, 352/78,
// 322/168, 66/178; reed clumps in the far-shore corners) — ducks shouldn't
// swim through scenery.
const NO_SWIM_ZONES: { x0: number; x1: number; y0: number; y1: number }[] = [
  { x0: 27, x1: 73, y0: 30, y1: 78 }, // island
  { x0: 7, x1: 17, y0: 27, y1: 40 }, // lily (48,66)
  { x0: 83, x1: 93, y0: 33, y1: 46 }, // lily (352,78)
  { x0: 75, x1: 86, y0: 78, y1: 90 }, // lily (322,168)
  { x0: 11, x1: 22, y0: 83, y1: 95 }, // lily (66,178)
  { x0: 0, x1: 13, y0: 0, y1: 30 }, // reeds, top-left corner
  { x0: 88, x1: 100, y0: 0, y1: 30 }, // reeds, top-right corner
];
// Open-water sampling bounds (percent) — inside the lake, below the far shore.
const WATER_BOUNDS = { x0: 5, x1: 95, y0: 34, y1: 90 };

function inNoSwimZone(x: number, y: number): boolean {
  return NO_SWIM_ZONES.some((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1);
}

// Random open-water point (rejection sample around the island + obstacles;
// falls back to the mid-front band which is always open water).
function randomWaterPoint(rand: () => number): { x: number; y: number } {
  for (let i = 0; i < 14; i++) {
    const x = WATER_BOUNDS.x0 + rand() * (WATER_BOUNDS.x1 - WATER_BOUNDS.x0);
    const y = WATER_BOUNDS.y0 + rand() * (WATER_BOUNDS.y1 - WATER_BOUNDS.y0);
    if (!inNoSwimZone(x, y)) return { x, y };
  }
  return { x: 30 + rand() * 40, y: 80 + rand() * 8 };
}

function pondRosterKey(state: GameState): string {
  return state.rosters.pond.join(",") + "|" + getStats(state).pondSlots;
}

// The LAKE (W5, playtest: "treat it as a lake rather than a pond — large,
// ducks float across the entire area, the island made no sense"). One
// coherent scene, edge to edge:
// - preserveAspectRatio="none" so the water genuinely fills the whole band
//   (the old "meet" letterboxed it into a small centered pond).
// - A far-shore grass strip runs along the very top with a wavy waterline —
//   the lake reads as continuing past the left/right/bottom edges of view.
// - ONE organic island: a single irregular landmass built as waterline ink →
//   sandy shore ring → grass top with tufts and a rock, plus a soft
//   reflection beneath. It replaces the old stack of disjoint ellipse/dome
//   shapes (the tree's own grass mound is gone too — the island is the only
//   ground plane, and the tree roots directly into it).
// viewBox 0 0 400 200; island crest ~y=74 (37%), footprint x≈118..282.
//
// `showStump` adds the felled Act-1 stump on the island in chapter 2.
function pondSvg(showStump: boolean): string {
  const stump = showStump
    ? `<g class="pond-stump">
         <ellipse cx="146" cy="92" rx="13" ry="5" fill="var(--foliage-deep)" opacity="0.5"/>
         <path d="M 136 90 L 137 80 Q 146 77 155 80 L 156 90 Z" fill="color-mix(in srgb, var(--surface-border) 40%, var(--ground))" stroke="var(--surface-border)" stroke-width="1.2"/>
         <ellipse cx="146" cy="80" rx="9.5" ry="3.4" fill="color-mix(in srgb, var(--surface-border) 25%, var(--ground))" stroke="var(--surface-border)" stroke-width="1"/>
         <ellipse cx="146" cy="80" rx="4.5" ry="1.6" fill="none" stroke="var(--surface-border)" stroke-width="0.8" opacity="0.7"/>
       </g>`
    : "";
  return `
    <svg class="pond-svg" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="pond-water-grad" cx="50%" cy="45%" r="78%">
          <stop offset="0%" stop-color="var(--pond-water-deep)"/>
          <stop offset="55%" stop-color="var(--pond-water)"/>
          <stop offset="100%" stop-color="color-mix(in srgb, var(--sky-bottom) 24%, var(--pond-water))"/>
        </radialGradient>
      </defs>

      <!-- Water fills the whole band, edge to edge and off the bottom. -->
      <rect class="pond-water" x="0" y="14" width="400" height="186" fill="url(#pond-water-grad)"/>

      <!-- Far shore: a grass strip along the top with a wavy waterline. -->
      <path class="pond-far-shore"
        d="M 0 0 L 400 0 L 400 18 C 352 26 320 14 268 20 C 236 24 210 14 168 18 C 120 23 78 13 34 20 L 0 16 Z"
        fill="var(--ground)"/>
      <path class="pond-far-shoreline"
        d="M 400 18 C 352 26 320 14 268 20 C 236 24 210 14 168 18 C 120 23 78 13 34 20 L 0 16"
        fill="none" stroke="var(--foliage-deep)" stroke-width="2.5" opacity="0.7"/>

      <!-- Soft canopy reflection on the water south of the island. -->
      <ellipse class="pond-reflection" cx="200" cy="160" rx="90" ry="15"
        fill="var(--foliage-deep)" opacity="0.16"/>

      <!-- Slow expanding ripple rings (transform-only; see components.css). -->
      <ellipse class="pond-ring-anim" cx="82" cy="120" rx="26" ry="8" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6"/>
      <ellipse class="pond-ring-anim" cx="330" cy="102" rx="22" ry="7" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6" style="animation-delay:-2.4s"/>
      <ellipse class="pond-ring-anim" cx="196" cy="176" rx="24" ry="7" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6" style="animation-delay:-4.6s"/>

      <!-- Sun glints on the open water -->
      <path class="pond-glint twinkle" d="M 60 84 l 14 0 M 322 140 l 11 0" stroke="var(--scene-detail)" stroke-width="2.2" stroke-linecap="round" opacity="0.5"/>
      <path class="pond-glint twinkle" style="animation-delay:1.6s" d="M 128 158 l 12 0 M 296 66 l 9 0" stroke="var(--scene-detail)" stroke-width="2" stroke-linecap="round" opacity="0.4"/>

      <g class="pond-lilies">
        <path class="lily" d="M 48 66 a 15 9 0 1 0 0.1 0 M 48 66 L 62 60" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 352 78 a 12 7 0 1 0 0.1 0 M 352 78 L 364 74" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 322 168 a 10 6 0 1 0 0.1 0" fill="var(--foliage-deep)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 66 178 a 11 6 0 1 0 0.1 0" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
      </g>

      <!-- THE ISLAND: one organic landmass. Waterline ink -> sandy shore ring
           -> grass top. The tree roots directly into the grass (its own mound
           was removed) so there is exactly one ground plane. -->
      <g class="pond-island">
        <!-- underwater shadow ring -->
        <ellipse cx="200" cy="140" rx="112" ry="22" fill="var(--pond-water-deep)" opacity="0.4"/>
        <!-- sandy shore: irregular outer blob with the waterline ink edge -->
        <path class="pond-island-shore" d="M 112 138
          C 104 116 118 94 140 84
          C 158 74 178 70 200 71
          C 226 70 250 76 266 88
          C 286 98 296 118 288 136
          C 282 148 260 155 232 157
          C 208 160 176 159 150 154
          C 130 150 118 146 112 138 Z"
          fill="color-mix(in srgb, var(--gold) 22%, var(--surface))"
          stroke="var(--surface-border)" stroke-width="2.5"/>
        <!-- grass top: inset blob with its own irregular edge -->
        <path class="pond-island-grass" d="M 126 130
          C 120 112 132 96 152 88
          C 168 80 184 77 202 78
          C 224 77 244 82 258 92
          C 274 101 282 116 276 130
          C 270 141 252 147 228 149
          C 206 151 178 150 156 146
          C 140 143 130 138 126 130 Z"
          fill="var(--ground)"/>
        <path class="pond-island-grass-edge" d="M 126 130 C 120 112 132 96 152 88 C 168 80 184 77 202 78 C 224 77 244 82 258 92 C 274 101 282 116 276 130"
          fill="none" stroke="var(--foliage-deep)" stroke-width="2" opacity="0.55"/>
        <!-- grass tufts + a rock for texture -->
        <path class="pond-island-tuft" d="M 160 96 q -1 -8 2 -12 M 168 94 q 0 -9 3 -12 M 236 96 q 1 -9 4 -11 M 244 100 q 1 -8 3 -11 M 200 84 q 0 -8 2 -11"
          fill="none" stroke="var(--foliage-deep)" stroke-width="2.4" stroke-linecap="round"/>
        <path class="pond-island-rock" d="M 252 134 l 4 -8 l 9 -2 l 7 6 l -3 7 l -12 2 Z"
          fill="color-mix(in srgb, var(--surface-border) 45%, var(--ground))" stroke="var(--surface-border)" stroke-width="1.5"/>
      </g>
      ${stump}

      <!-- Reeds hug the far shore corners where land meets water. -->
      <g class="pond-reeds">
        <path d="M 18 44 Q 14 28 20 12 M 26 46 Q 24 30 32 16 M 34 48 Q 34 34 42 22"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
        <path d="M 372 46 Q 378 28 372 12 M 380 48 Q 388 30 382 16"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>
  `;
}

// Hash-seeded pseudo-random stream (for deterministic initial positions and
// bubble spots keyed by an id string).
function seededRand(seedNum: number): () => number {
  let s = seedNum >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function slotHtml(state: GameState, i: number): string {
  const defId = state.rosters.pond[i];
  if (defId) {
    const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
    // Free-roaming swimmer (W5): starts at a deterministic open-water point;
    // the waypoint wander system then glides it across the whole lake. The
    // duck's lower body is clipped at a waterline (W4) with a wake at the
    // line; the inner swimmer bobs on its own timer.
    const start = randomWaterPoint(seededRand(hashId(defId)));
    const style = `left:${start.x.toFixed(1)}%;top:${start.y.toFixed(1)}%;`;
    return `
      <div class="pond-seat occupied" data-slot="${i}" data-duck="${defId}" style="${style}">
        <span class="pond-wake"></span>
        <span class="pond-swimmer">
          ${duckSvg(defId, 44, { ascension, ringed: false })}
        </span>
      </div>`;
  }
  const dock = EMPTY_DOCK_POS[i % EMPTY_DOCK_POS.length];
  return `
    <div class="pond-seat empty" data-slot="${i}" style="left:${dock.left};top:${dock.top};" title="Assign a duck to swim">
      <span class="pond-seat-plus">+</span>
    </div>`;
}

// ---- Waypoint wander (W5): each occupied swimmer periodically picks a new
// open-water point and glides there via a CSS left/top transition, flipping
// to face its heading (rig art faces LEFT, so rightward travel flips). One
// shared 1s timer drives all swimmers; rebuilt rosters reset it. Reduced
// motion: swimmers stay at their start points (no wandering).
interface Swimmer {
  el: HTMLElement;
  nextMoveAt: number;
  rand: () => number;
}
let swimmers: Swimmer[] = [];
let wanderTimer: number | null = null;

function moveSwimmer(sw: Swimmer, now: number): void {
  const fromX = parseFloat(sw.el.style.left) || 50;
  const fromY = parseFloat(sw.el.style.top) || 80;
  const to = randomWaterPoint(sw.rand);
  const dist = Math.hypot(to.x - fromX, to.y - fromY);
  const durSec = Math.max(3, dist * 0.22); // slow paddle, ~0.22s per percent
  sw.el.style.transitionDuration = `${durSec.toFixed(1)}s, ${durSec.toFixed(1)}s`;
  sw.el.style.left = `${to.x.toFixed(1)}%`;
  sw.el.style.top = `${to.y.toFixed(1)}%`;
  sw.el.classList.toggle("facing-right", to.x > fromX);
  sw.nextMoveAt = now + durSec * 1000 + 1500 + sw.rand() * 5000; // pause, then wander on
}

function startWander(): void {
  if (wanderTimer !== null) {
    clearInterval(wanderTimer);
    wanderTimer = null;
  }
  if (reducedMotion || swimmers.length === 0) return;
  wanderTimer = window.setInterval(() => {
    const now = Date.now();
    for (const sw of swimmers) {
      if (now >= sw.nextMoveAt && sw.el.isConnected) moveSwimmer(sw, now);
    }
  }, 1000);
}

// Deterministic per-id hash (FNV-1a-ish), so a bubble's on-water position and
// its fish-arc target stay stable across re-renders while it's alive.
function hashId(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 10000;
}

// Places a bubble on open water — clear of the central island (which occupies
// ~35%..65% width in the upper water) and near the front/flanks where the water
// is visible. Deterministic per bubble id: a bubble either lands on a flank
// (left/right open water) or in the low front band below the island.
function bubblePosition(id: string): { left: string; top: string } {
  // Anywhere on open water (same sampler as the swimmers), deterministic per id.
  const p = randomWaterPoint(seededRand(hashId(id)));
  return { left: `${p.x.toFixed(1)}%`, top: `${p.y.toFixed(1)}%` };
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

  swimmers = [];
  slotsEl.querySelectorAll<HTMLElement>(".pond-seat").forEach((slot, idx) => {
    // Stagger the inner bob per seat; register occupied seats as wandering
    // swimmers (first waypoints staggered so ducks don't set off in lockstep).
    const swimmer = slot.querySelector<HTMLElement>(".pond-swimmer");
    if (swimmer) {
      swimmer.style.animationDuration = `${3 + (idx % 3) * 0.7}s`;
      swimmer.style.animationDelay = `${(idx % 4) * -0.9}s`;
      swimmers.push({
        el: slot,
        nextMoveAt: Date.now() + 800 + idx * 2200,
        rand: seededRand(hashId(slot.dataset.duck ?? String(idx)) ^ 0x5f3759df),
      });
    }
    slot.addEventListener("click", () => openRosterPicker(state, "pond", Number(slot.dataset.slot)));
    const defId = slot.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(slot, () => duckTooltipHtml(state, duck));
      makeDuckDraggable(slot, defId, state);
    }
    makeDuckDropTarget(slot, "pond", Number(slot.dataset.slot), state);
  });

  startWander();
  lastRosterKey = pondRosterKey(state);
}

export function initPondArea(el: HTMLElement, state: GameState): void {
  panel = el;
  gameState = state;
  panel.innerHTML = `
    <div class="panel-body pond-body">
      <div class="pond-scene">
        ${pondSvg(state.chapter === 2)}
        <div class="pond-ducks" id="pond-ducks"></div>
        <div class="pond-bubbles" id="pond-bubbles"></div>
      </div>
      <div class="pond-income-chip" id="pond-income-chip">
        <small id="pond-ticker"></small>
      </div>
    </div>
  `;
  sceneEl = panel.querySelector<HTMLElement>(".pond-scene")!;
  slotsEl = panel.querySelector<HTMLElement>("#pond-ducks")!;
  bubblesEl = panel.querySelector<HTMLElement>("#pond-bubbles")!;
  tickerEl = panel.querySelector<HTMLElement>("#pond-ticker")!;

  // Chapter 2 adds the felled-Act-1-tree stump on the island.
  on("chapterAdvance", () => {
    const svg = sceneEl.querySelector(".pond-svg");
    if (svg) svg.outerHTML = pondSvg(gameState.chapter === 2);
  });

  on("roster", () => rebuildRoster(gameState));

  rebuildRoster(state);
}

export function renderPondArea(state: GameState): void {
  if (pondRosterKey(state) !== lastRosterKey) rebuildRoster(state);
  const income = pondIncomePerSec(state, getStats(state));
  tickerEl.textContent = income.goldPerSec > 0 ? `${fmt(income.goldPerSec * 3600)}/hr` : "idle";
  renderBubbles(state);
}
