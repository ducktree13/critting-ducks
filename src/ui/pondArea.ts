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
import { equippedItemsFor } from "../game/gear";
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

// Up to 5 seats arranged around the pond's water ring, OUTSIDE the central
// island silhouette (percent-based over the pond scene). The pond scene is a
// wide shallow ellipse filling its box; the island hump sits in the middle
// (~35%..65% width, upper-water). Seats ring the open water: two front-low,
// two mid-flanking, one back-center behind the island edge.
const SEAT_POS: { left: string; top: string }[] = [
  { left: "18%", top: "62%" },
  { left: "36%", top: "82%" },
  { left: "64%", top: "82%" },
  { left: "82%", top: "62%" },
  { left: "50%", top: "40%" },
];

function pondRosterKey(state: GameState): string {
  return state.rosters.pond.join(",") + "|" + getStats(state).pondSlots;
}

// Wide shallow pond SVG (Phase V2): the tree grove sits on an island in the
// middle of the pond. A broad ellipse hugs the bottom of the scene (ink ring,
// bank, water, offset deep-water), ripples + reeds + lily pads ring the edges,
// and a grassy island MOUND rises in the centre — the tree canvas is placed so
// its own grass mound fuses with this island top. viewBox 0 0 400 200: water
// centre ~ (200,120), island crest ~ y=78 spanning x≈120..280.
//
// `showStump` draws a small felled-tree stump on the island (chapter 2), a cheap
// nod to the Act-1 tree that was felled to open the forest.
function pondSvg(showStump: boolean): string {
  const stump = showStump
    ? `<g class="pond-stump">
         <ellipse cx="150" cy="86" rx="13" ry="5" fill="var(--foliage-deep)" opacity="0.5"/>
         <path d="M 140 84 L 141 74 Q 150 71 159 74 L 160 84 Z" fill="color-mix(in srgb, var(--surface-border) 40%, var(--ground))" stroke="var(--surface-border)" stroke-width="1.2"/>
         <ellipse cx="150" cy="74" rx="9.5" ry="3.4" fill="color-mix(in srgb, var(--surface-border) 25%, var(--ground))" stroke="var(--surface-border)" stroke-width="1"/>
         <ellipse cx="150" cy="74" rx="4.5" ry="1.6" fill="none" stroke="var(--surface-border)" stroke-width="0.8" opacity="0.7"/>
       </g>`
    : "";
  return `
    <svg class="pond-svg" viewBox="0 0 400 200" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <!-- Water shades from a lighter sunlit rim into deeper center water
             (W4: "the water needs to look better" — a flat fill read as paint). -->
        <radialGradient id="pond-water-grad" cx="50%" cy="42%" r="72%">
          <stop offset="0%" stop-color="var(--pond-water-deep)"/>
          <stop offset="55%" stop-color="var(--pond-water)"/>
          <stop offset="100%" stop-color="color-mix(in srgb, var(--sky-bottom) 28%, var(--pond-water))"/>
        </radialGradient>
      </defs>

      <!-- Wide shallow water ellipse hugging the bottom of the scene. -->
      <ellipse class="pond-ring" cx="200" cy="130" rx="196" ry="66" fill="var(--surface-border)"/>
      <ellipse class="pond-bank" cx="200" cy="128" rx="184" ry="59"
        fill="color-mix(in srgb, var(--surface-border) 30%, var(--ground))"/>
      <ellipse class="pond-water" cx="200" cy="126" rx="170" ry="52" fill="url(#pond-water-grad)"/>

      <!-- Soft canopy reflection cast by the island's tree onto the water. -->
      <ellipse class="pond-reflection" cx="200" cy="152" rx="86" ry="16"
        fill="var(--foliage-deep)" opacity="0.18"/>

      <!-- Slow expanding ripple rings (transform-only; see components.css). -->
      <ellipse class="pond-ring-anim" cx="120" cy="140" rx="26" ry="8" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6"/>
      <ellipse class="pond-ring-anim" cx="286" cy="132" rx="22" ry="7" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6" style="animation-delay:-2.4s"/>
      <ellipse class="pond-ring-anim" cx="196" cy="164" rx="24" ry="7" fill="none"
        stroke="var(--scene-detail)" stroke-width="1.6" style="animation-delay:-4.6s"/>

      <path class="pond-ripple" d="M 54 118 Q 96 110 138 118" fill="none" stroke="var(--scene-detail)" stroke-width="2" opacity="0.35"/>
      <path class="pond-ripple" d="M 262 120 Q 310 112 356 120" fill="none" stroke="var(--scene-detail)" stroke-width="2" opacity="0.35"/>
      <!-- Sun glints on the water -->
      <path class="pond-glint twinkle" d="M 92 138 l 14 0 M 300 146 l 11 0" stroke="var(--scene-detail)" stroke-width="2.2" stroke-linecap="round" opacity="0.5"/>
      <path class="pond-glint twinkle" style="animation-delay:1.6s" d="M 158 156 l 12 0 M 252 158 l 9 0" stroke="var(--scene-detail)" stroke-width="2" stroke-linecap="round" opacity="0.4"/>

      <g class="pond-lilies">
        <path class="lily" d="M 70 128 a 15 9 0 1 0 0.1 0 M 70 128 L 84 122" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 330 122 a 12 7 0 1 0 0.1 0 M 330 122 L 342 118" fill="var(--panel-head)" stroke="var(--surface-border)" stroke-width="1.5"/>
        <path class="lily" d="M 300 148 a 10 6 0 1 0 0.1 0" fill="var(--foliage-deep)" stroke="var(--surface-border)" stroke-width="1.5"/>
      </g>

      <!-- Central grassy ISLAND mound. Its crest (~y 78) is where the tree's
           own grass mound lands, so the two fuse into one ground plane. -->
      <g class="pond-island">
        <ellipse class="pond-island-shadow" cx="200" cy="150" rx="118" ry="20" fill="var(--pond-water-deep)" opacity="0.45"/>
        <path class="pond-island-fill" d="M 92 152
          C 96 118 128 82 200 80
          C 272 82 304 118 308 152 Z"
          fill="var(--ground)"/>
        <path class="pond-island-edge" d="M 92 152 C 96 118 128 82 200 80 C 272 82 304 118 308 152"
          fill="none" stroke="var(--foliage-deep)" stroke-width="2.5" opacity="0.6"/>
        <!-- grass tufts along the island crest -->
        <path class="pond-island-tuft" d="M 168 86 q -1 -8 2 -12 M 176 84 q 0 -9 3 -12 M 224 84 q 1 -9 4 -11 M 232 87 q 1 -8 3 -11"
          fill="none" stroke="var(--foliage-deep)" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      ${stump}

      <g class="pond-reeds">
        <path d="M 40 128 Q 36 104 42 82 M 46 130 Q 44 108 52 88 M 54 132 Q 54 112 62 94"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
        <path d="M 350 130 Q 356 106 350 84 M 358 132 Q 366 108 360 88"
          fill="none" stroke="var(--foliage-deep)" stroke-width="3" stroke-linecap="round"/>
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
    // Swimming presentation (W4): the duck's lower body is clipped at a
    // waterline so it sits IN the water rather than floating above it, with a
    // wake ellipse at the waterline. The seat drifts horizontally (pond-drift,
    // flipping to face its heading); the inner swimmer bobs independently.
    return `
      <div class="pond-seat occupied" data-slot="${i}" data-duck="${defId}" style="${style}">
        <span class="pond-wake"></span>
        <span class="pond-swimmer">
          ${duckSvg(defId, 44, { ascension, ringed: false, equipment: equippedItemsFor(state, defId) })}
        </span>
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

// Places a bubble on open water — clear of the central island (which occupies
// ~35%..65% width in the upper water) and near the front/flanks where the water
// is visible. Deterministic per bubble id: a bubble either lands on a flank
// (left/right open water) or in the low front band below the island.
function bubblePosition(id: string): { left: string; top: string } {
  const h = hashId(id);
  const lane = h % 3;
  if (lane === 0) {
    // left flank
    return { left: `${10 + (h % 16)}%`, top: `${58 + ((h >> 4) % 22)}%` };
  }
  if (lane === 1) {
    // right flank
    return { left: `${74 + (h % 16)}%`, top: `${58 + ((h >> 4) % 22)}%` };
  }
  // low front band (below the island)
  return { left: `${34 + (h % 34)}%`, top: `${76 + ((h >> 4) % 16)}%` };
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
    // Stagger per seat so ducks don't move in lockstep: the seat's slow
    // drift-and-turn swim (long, varied) and the inner bob (short, varied).
    slot.style.animationDuration = `${14 + (idx % 5) * 2.4}s`;
    slot.style.animationDelay = `${(idx % 5) * -3.7}s`;
    const swimmer = slot.querySelector<HTMLElement>(".pond-swimmer");
    if (swimmer) {
      swimmer.style.animationDuration = `${3 + (idx % 3) * 0.7}s`;
      swimmer.style.animationDelay = `${(idx % 4) * -0.9}s`;
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
  // Gear swaps don't change pondRosterKey; rebuild seats when a duck shown in
  // the pond has its equipment change (R5b).
  on("gear", (e) => {
    if (e.defId == null || gameState.rosters.pond.includes(e.defId)) rebuildRoster(gameState);
  });

  rebuildRoster(state);
}

export function renderPondArea(state: GameState): void {
  if (pondRosterKey(state) !== lastRosterKey) rebuildRoster(state);
  const income = pondIncomePerSec(state, getStats(state));
  tickerEl.textContent = income.goldPerSec > 0 ? `${fmt(income.goldPerSec * 3600)}/hr` : "idle";
  renderBubbles(state);
}
