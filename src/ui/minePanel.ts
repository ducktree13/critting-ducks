import { ORE_LEVEL_GATES, ORE_VALUES } from "../game/balance";
import { on } from "../game/events";
import { equippedItemsFor } from "../game/gear";
import { getStats, refreshStats } from "../game/state";
import type { GameState, OreId } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { makeDuckDraggable, makeDuckDropTarget } from "./dragDuck";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";

const ORE_COLORS: Record<OreId, string> = {
  copper: "#c77b4a",
  silver: "#b8bec9",
  crystal: "#7ad0e0",
  starmetal: "#8a7ae0",
  voidstone: "#4a3a6a",
  aurorium: "#ffd75e",
};

const ORE_NAMES: Record<OreId, string> = {
  copper: "Copper",
  silver: "Silver",
  crystal: "Crystal",
  starmetal: "Starmetal",
  voidstone: "Voidstone",
  aurorium: "Aurorium",
};

const ORE_UNLOCK_HINT: Record<OreId, string> = {
  copper: "",
  silver: "Silver Vein node",
  crystal: "Crystal Cavern node",
  starmetal: "Starmetal Seam node",
  voidstone: "Void Fissure node (Act 2)",
  aurorium: "Aurorium Heart node (Act 2)",
};

let panel: HTMLElement;
let rockEl: HTMLElement;
let duckRowEl: HTMLElement;
let oreCountersEl: HTMLElement;
let veinsEl: HTMLElement;
let tickerEl: HTMLElement;
let missionEl: HTMLElement;
let caveAnchorEl: HTMLElement;
let goldTargetEl: HTMLElement | null = null;
let lastRosterKey = "";
let lastOreCountersKey = "";

// Mine hillside backdrop (Phase H + R4a, PLAN2.md world redesign): a static
// SVG scene sitting behind the rock/vein/duck-row content via a negative
// z-index. The container (.mine-scene) is tall (~373x744 in the world
// layout), so the viewBox is authored TALL (400x780) to match; earlier the
// 400x260 wide viewBox scaled up under `slice` and cropped the whole
// composition off-frame. Reads as the near face of the backdrop's left
// hillside — no sky paint of its own (transparent above the hill shapes) so
// it sits seamlessly over #world-backdrop. All KEY content (cave mouth,
// timber, rail, lantern) sits within a safe central column (~x=60..340) so
// the width `slice` crops (at 1100-1600px) only ever trim empty margins.
// Top→bottom: hill crest + strata, a large timber-framed cave mouth in the
// upper-middle, an S-curved mine-cart rail down to a ground ledge, a lantern
// beside the mouth (brightens at night), gold ore sparkles, scatter pebbles.
function caveSceneSvg(): string {
  return `<svg viewBox="0 0 400 780" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="cave-mouth" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stop-color="#000" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Hill mass across the top third: near face of the backdrop's left
         hillside, with a couple of strata bands. -->
    <path class="mine-hill" d="M0 780 L0 150 Q120 40 200 34 Q280 40 400 150 L400 780 Z"
      fill="color-mix(in srgb, var(--surface-border) 40%, var(--ground))"/>
    <path class="mine-strata" d="M0 190 Q100 150 200 160 Q300 150 400 190 L400 208 Q300 168 200 178 Q100 168 0 208 Z"
      fill="color-mix(in srgb, var(--surface-border) 30%, var(--ground))" opacity="0.6"/>
    <path class="mine-strata" d="M0 250 Q100 214 200 222 Q300 214 400 250 L400 266 Q300 230 200 238 Q100 230 0 266 Z"
      fill="color-mix(in srgb, var(--surface-border) 24%, var(--ground))" opacity="0.55"/>

    <!-- Mine-cart rail: gentle S-curve from the cave mouth down to the ground
         ledge in the bottom third. Two rails + sleepers. -->
    <g class="mine-rail">
      <path d="M175 300 C150 420 250 500 220 640" fill="none" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round"/>
      <path d="M225 300 C200 420 300 500 270 640" fill="none" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round"/>
      <line x1="168" y1="330" x2="222" y2="330" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="156" y1="380" x2="212" y2="380" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="158" y1="440" x2="222" y2="440" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="180" y1="500" x2="252" y2="500" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="208" y1="560" x2="278" y2="560" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="222" y1="620" x2="288" y2="620" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
    </g>

    <!-- Ground ledge in the bottom third the ducks stand on -->
    <path class="mine-ledge" d="M0 640 Q200 616 400 640 L400 780 L0 780 Z"
      fill="color-mix(in srgb, var(--surface-border) 50%, var(--ground))" opacity="0.55"/>

    <!-- Timber posts + lintel framing a LARGE cave mouth in the upper-middle -->
    <g class="mine-timber">
      <rect x="98" y="150" width="18" height="150" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="284" y="150" width="18" height="150" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="88" y="134" width="224" height="22" rx="5" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
    </g>

    <!-- Cave mouth: dark arched opening (~200 wide) with depth gradient -->
    <path class="mine-cave-mouth" d="M108 300 Q108 168 200 158 Q292 168 292 300 Z"
      fill="color-mix(in srgb, var(--surface-border) 78%, var(--ground))"/>
    <ellipse cx="200" cy="238" rx="92" ry="78" fill="url(#cave-mouth)"/>

    <!-- Hanging lantern beside the mouth -->
    <g class="mine-lantern">
      <circle class="mine-lantern-glow" cx="316" cy="212" r="24" fill="var(--scene-detail)" opacity="0.18"/>
      <line x1="316" y1="150" x2="316" y2="188" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="306" y="188" width="20" height="26" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="1.8"/>
      <circle class="mine-lantern-light" cx="316" cy="201" r="5.5" fill="var(--scene-detail)"/>
    </g>

    <!-- Gold ore sparkles scattered on the hill face -->
    <g class="mine-sparkles">
      <path class="twinkle" style="animation-delay:0.4s" d="M70 210 l4.5 -9 l4.5 9 l-4.5 9 z" fill="var(--gold)"/>
      <path d="M92 268 l3.6 -7 l3.6 7 l-3.6 7 z" fill="var(--gold)"/>
      <path class="twinkle" style="animation-delay:1.5s" d="M330 206 l4.5 -9 l4.5 9 l-4.5 9 z" fill="var(--gold)"/>
      <path d="M338 272 l3.2 -6 l3.2 6 l-3.2 6 z" fill="var(--gold)"/>
      <path class="twinkle" style="animation-delay:2.3s" d="M74 340 l3.6 -7 l3.6 7 l-3.6 7 z" fill="var(--gold)"/>
      <path d="M320 344 l3.6 -7 l3.6 7 l-3.6 7 z" fill="var(--gold)"/>
    </g>

    <!-- Scatter pebbles for texture -->
    <g class="mine-pebbles" fill="color-mix(in srgb, var(--surface-border) 55%, var(--ground))" opacity="0.7">
      <ellipse cx="86" cy="668" rx="14" ry="8"/>
      <ellipse cx="330" cy="676" rx="16" ry="9"/>
      <ellipse cx="120" cy="712" rx="10" ry="6"/>
      <ellipse cx="300" cy="720" rx="12" ry="7"/>
      <circle cx="200" cy="700" r="6"/>
    </g>
  </svg>`;
}

export function initMinePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  panel.innerHTML = `
    <div class="area-chip">Mine <span class="panel-ticker" id="mine-ticker"></span></div>
    <div class="panel-body mine-body">
      <div class="mine-scene">${caveSceneSvg()}</div>
      <div class="mine-cave-anchor" id="mine-cave-anchor" aria-hidden="true"></div>
      <div class="mission-slot" id="mine-mission"></div>
      <div class="mine-rock" id="mine-rock"></div>
      <div class="duck-row" id="mine-ducks"></div>
      <div class="mine-controls">
        <div class="vein-row well" id="vein-row"></div>
        <div class="ore-counters" id="ore-counters"></div>
      </div>
    </div>
  `;
  rockEl = panel.querySelector("#mine-rock")!;
  duckRowEl = panel.querySelector("#mine-ducks")!;
  oreCountersEl = panel.querySelector("#ore-counters")!;
  veinsEl = panel.querySelector("#vein-row")!;
  tickerEl = panel.querySelector("#mine-ticker")!;
  missionEl = panel.querySelector("#mine-mission")!;
  caveAnchorEl = panel.querySelector("#mine-cave-anchor")!;
  goldTargetEl = document.querySelector("#hud-gold-amount");

  // Cave-mouth vectors are computed from getBoundingClientRect and cached per
  // duck; invalidate on resize so the walk targets the right screen point.
  window.addEventListener("resize", () => {
    walkVectors.clear();
  });

  renderVeins(state);
  renderRoster(state);

  // Ore unlock nodes and level-ups change which veins are selectable; the
  // tick-cached stats snapshot doesn't include the change yet, so refresh.
  on("buy", () => {
    refreshStats(state, Date.now());
    renderVeins(state);
  });
  on("levelup", () => {
    refreshStats(state, Date.now());
    renderVeins(state);
  });

  on("hit", (e) => {
    if (e.panel !== "mine") return;
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) walkIntoCave(duckEl, e.duckId);
  });

  // Equipping/unequipping gear doesn't change rosterKey, so force a roster
  // rebuild when a duck currently shown in the mine has its gear change (R5b).
  on("gear", (e) => {
    if (e.defId == null || state.rosters.mine.includes(e.defId)) renderRoster(state);
  });
}

const MAX_PIPS = 16;
const livePips: HTMLElement[] = [];

// Screen-space center of the cave mouth (top of the .mine-cave-anchor's rect,
// which the JS-driven walk aims for and the ore pip launches from).
function caveMouthPoint(): { x: number; y: number } {
  const r = caveAnchorEl.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

const prefersReducedMotion =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Per-duck cached walk vector (slot center → cave mouth), invalidated on
// resize. Also gates re-triggering: a duck mid-walk is skipped so a second
// hit doesn't restart the animation in flight.
const walkVectors = new Map<string, { dx: number; dy: number }>();
const walking = new Set<string>();
const WALK_MS = 1100;

// PLAN2.md §12 / Phase R4a: on a mining hit the hitting duck steps toward the
// cave mouth, shrinking + darkening as it "enters", pauses, then returns to
// its slot. A CSS transition drives translate/scale/brightness via custom
// properties. Respects prefers-reduced-motion (skips the walk, keeps the pip).
function walkIntoCave(duckEl: HTMLElement, duckId: string): void {
  if (prefersReducedMotion) {
    spawnOrePip();
    return;
  }
  if (walking.has(duckId)) return;

  let vec = walkVectors.get(duckId);
  if (!vec) {
    const from = duckEl.getBoundingClientRect();
    const cave = caveMouthPoint();
    vec = {
      dx: cave.x - (from.left + from.width / 2),
      dy: cave.y - (from.top + from.height / 2),
    };
    walkVectors.set(duckId, vec);
  }

  walking.add(duckId);
  duckEl.classList.add("mine-walking");
  // Enter leg: travel ~55% of the vector into the mouth, shrink + darken.
  duckEl.style.setProperty("--walk-x", `${vec.dx * 0.55}px`);
  duckEl.style.setProperty("--walk-y", `${vec.dy * 0.55}px`);
  duckEl.style.setProperty("--walk-scale", "0.7");
  duckEl.style.setProperty("--walk-bright", "0.6");

  // Return leg starts partway through; ore pip flies from the cave mouth on
  // the way back out.
  const returnTimer = window.setTimeout(() => {
    duckEl.style.setProperty("--walk-x", "0px");
    duckEl.style.setProperty("--walk-y", "0px");
    duckEl.style.setProperty("--walk-scale", "1");
    duckEl.style.setProperty("--walk-bright", "1");
    spawnOrePip();
  }, WALK_MS * 0.55);

  window.setTimeout(() => {
    duckEl.classList.remove("mine-walking");
    duckEl.style.removeProperty("--walk-x");
    duckEl.style.removeProperty("--walk-y");
    duckEl.style.removeProperty("--walk-scale");
    duckEl.style.removeProperty("--walk-bright");
    walking.delete(duckId);
    clearTimeout(returnTimer);
  }, WALK_MS);
}

// A small ore pip that flies from the cave mouth to the HUD gold counter
// (PLAN2.md §12: "deposit it on a stockpile, pip flies to the HUD gold
// counter"). Capped like floaters.ts so a fast crit streak can't spam
// unbounded DOM nodes.
function spawnOrePip(): void {
  if (!goldTargetEl) return;
  if (livePips.length >= MAX_PIPS) return;
  const from = caveMouthPoint();
  const to = goldTargetEl.getBoundingClientRect();

  const pip = document.createElement("div");
  pip.className = "ore-pip";
  pip.style.left = `${from.x}px`;
  pip.style.top = `${from.y}px`;
  document.body.appendChild(pip);
  livePips.push(pip);

  requestAnimationFrame(() => {
    pip.style.transform = `translate(${to.left + to.width / 2 - from.x}px, ${to.top + to.height / 2 - from.y}px) scale(0.3)`;
    pip.style.opacity = "0";
  });
  setTimeout(() => {
    pip.remove();
    const i = livePips.indexOf(pip);
    if (i !== -1) livePips.splice(i, 1);
  }, 500);
}

// Restart a CSS animation by removing and re-adding its class.
function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function rockSvg(ore: OreId): string {
  const c = ORE_COLORS[ore];
  return `<svg viewBox="0 0 200 160" width="180" height="144" role="img" aria-label="${ORE_NAMES[ore]} rock">
    <polygon points="30,140 12,90 45,40 100,18 160,38 188,95 168,140" fill="color-mix(in srgb, var(--surface-border) 45%, var(--ground))"/>
    <polygon points="60,120 50,85 80,60 120,55 145,85 135,120" fill="${c}"/>
    <polygon points="80,95 95,72 118,80 110,102" fill="var(--scene-detail)" opacity="0.35"/>
  </svg>`;
}

function renderVeins(state: GameState): void {
  const stats = getStats(state);
  veinsEl.innerHTML = (Object.keys(ORE_VALUES) as OreId[])
    .map((ore) => {
      const unlocked = stats.unlockedOres.includes(ore);
      const active = state.selectedOre === ore;
      if (!unlocked) {
        const levelGated = state.level < ORE_LEVEL_GATES[ore];
        const hint = [ORE_UNLOCK_HINT[ore], levelGated ? `level ${ORE_LEVEL_GATES[ore]}` : ""]
          .filter(Boolean)
          .join(" + ");
        return `<button class="vein locked" disabled data-ore="${ore}" data-hint="${hint}">🔒 ${ORE_NAMES[ore]}${levelGated ? ` <small>Lv ${ORE_LEVEL_GATES[ore]}</small>` : ""}</button>`;
      }
      return `<button class="vein${active ? " active" : ""}" data-ore="${ore}">${ORE_NAMES[ore]} <small>${ORE_VALUES[ore]}g</small></button>`;
    })
    .join("");

  veinsEl.querySelectorAll<HTMLButtonElement>(".vein[data-ore]:not(.locked)").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedOre = btn.dataset.ore as OreId;
      renderVeins(state);
      rockEl.innerHTML = rockSvg(state.selectedOre);
      retrigger(rockEl, "shake");
    });
  });
  veinsEl.querySelectorAll<HTMLButtonElement>(".vein[data-ore]").forEach((btn) => {
    const ore = btn.dataset.ore as OreId;
    attachTooltip(btn, () =>
      btn.classList.contains("locked")
        ? `<b>${ORE_NAMES[ore]}</b><div class="tt-meta">Unlock: ${btn.dataset.hint}</div>`
        : `<b>${ORE_NAMES[ore]}</b><div class="tt-meta">${ORE_VALUES[ore]} gold per ore</div>`,
    );
  });

  rockEl.innerHTML = rockSvg(state.selectedOre);
}

function renderRoster(state: GameState): void {
  const stats = getStats(state);
  const slots: string[] = [];
  for (let i = 0; i < stats.mineSlots; i++) {
    const defId = state.rosters.mine[i];
    if (defId) {
      const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
      slots.push(
        `<div class="duck-slot" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 64, { ascension, ringed: false, equipment: equippedItemsFor(state, defId) })}</div>`,
      );
    } else {
      slots.push(`<div class="duck-slot empty" data-slot="${i}" title="Assign a duck">+</div>`);
    }
  }
  duckRowEl.innerHTML = slots.join("");
  duckRowEl.querySelectorAll<HTMLElement>(".duck-slot").forEach((slot) => {
    slot.addEventListener("click", () =>
      openRosterPicker(state, "mine", Number(slot.dataset.slot)),
    );
    const defId = slot.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(slot, () => duckTooltipHtml(state, duck));
      makeDuckDraggable(slot, defId, state);
    }
    makeDuckDropTarget(slot, "mine", Number(slot.dataset.slot), state);
  });
  lastRosterKey = rosterKey(state);
}

function rosterKey(state: GameState): string {
  return state.rosters.mine.join(",") + "|" + getStats(state).mineSlots;
}

function oreCountersKey(state: GameState): string {
  // fmt() collapses to formatted strings, so the key must reflect the
  // *displayed* text (not raw ore counts) to avoid rebuilding on sub-display
  // fluctuations while still rebuilding whenever a shown value changes.
  return (Object.keys(ORE_VALUES) as OreId[])
    .filter((ore) => state.ores[ore] > 0)
    .map((ore) => `${ore}:${fmt(state.ores[ore])}`)
    .join(",");
}

export function renderMinePanel(state: GameState): void {
  if (rosterKey(state) !== lastRosterKey) renderRoster(state);

  const oreKey = oreCountersKey(state);
  if (oreKey !== lastOreCountersKey) {
    oreCountersEl.innerHTML = (Object.keys(ORE_VALUES) as OreId[])
      .filter((ore) => state.ores[ore] > 0)
      .map((ore) => `<span class="ore-counter">${ORE_NAMES[ore]}: ${fmt(state.ores[ore])}</span>`)
      .join("");
    lastOreCountersKey = oreKey;
  }

  tickerEl.textContent = `${state.rosters.mine.length} mining`;
  renderMissionTracker("mine", missionEl, state);
}
