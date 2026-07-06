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

// Mine CAVE INTERIOR (Phase V3, PLAN2.md world redesign): a static SVG scene
// sitting behind the rock/vein/duck-row content via a negative z-index. The
// camera is now INSIDE the cave looking OUT — dark rock walls wrap the top and
// both sides as a thick irregular vignette frame, the bottom third is the cave
// FLOOR, and a bright arched EXIT opening in the upper-middle shows the outside
// (sky + distant hill) with a soft light shaft spilling onto the floor. A
// mine-cart rail runs from the foreground floor up and out through the exit
// (perspective-narrowing). Interior detail: ore veins glinting in the side
// walls, two static hanging lanterns (warm glow, brightens at night — NO
// motion), wooden support beams, scattered pebbles.
//
// The container (.mine-scene) is tall (~373x744 in the world layout), so the
// viewBox is authored TALL (400x780). All KEY content (exit, rail, veins,
// lanterns) sits within a safe central column (~x=60..340) so the width
// `slice` crop (at 1100-1600px) only ever trims the outer wall margins.
function caveSceneSvg(): string {
  return `<svg viewBox="0 0 400 780" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="cave-exit-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--sky-top)"/>
        <stop offset="70%" stop-color="var(--sky-bottom)"/>
        <stop offset="100%" stop-color="color-mix(in srgb, var(--ground) 70%, var(--sky-bottom))"/>
      </linearGradient>
    </defs>

    <!-- Outside seen through the exit: sky gradient + a hint of distant hill.
         Drawn first so the wall frame overlaps its irregular edges. Sits behind
         the exit opening (~150-180 wide, arched). -->
    <g class="mine-exit">
      <path d="M118 292 Q118 120 200 108 Q282 120 282 292 Z" fill="url(#cave-exit-sky)"/>
      <path d="M118 292 Q160 260 200 262 Q240 260 282 292 L282 292 Z"
        fill="color-mix(in srgb, var(--ground) 78%, var(--sky-bottom))" opacity="0.85"/>
      <path d="M132 288 Q168 268 200 270 Q232 268 268 288 Z"
        fill="color-mix(in srgb, var(--surface-border) 30%, var(--ground))" opacity="0.55"/>
    </g>

    <!-- Light shaft: translucent light spilling from the exit down onto the
         cave floor, widening as it descends into the standing area. -->
    <polygon class="mine-lightshaft" points="140,300 260,300 320,660 80,660"
      fill="var(--scene-detail)" opacity="0.1"/>

    <!-- Cave-wall frame: heavy-ink dark rock wrapping the TOP and BOTH SIDES as
         a thick irregular vignette. Jagged inner edges hug the exit opening. -->
    <path class="mine-wall" fill="color-mix(in srgb, var(--surface-border) 80%, var(--ground))"
      d="M0 0 L400 0 L400 780 L332 780
         L332 300 Q332 250 300 210 Q300 300 282 292
         Q282 120 200 108 Q118 120 118 292
         Q100 300 100 210 Q68 250 68 300 L68 780 L0 780 Z"/>
    <!-- Softer inner rim so the wall edge doesn't read as a flat cutout -->
    <path class="mine-wall-rim" fill="color-mix(in srgb, var(--surface-border) 62%, var(--ground))" opacity="0.7"
      d="M100 300 Q100 132 200 120 Q300 132 300 300 L300 360
         Q300 316 200 306 Q100 316 100 360 Z"/>

    <!-- Strata cracks + embedded stones in the side walls -->
    <g class="mine-strata" stroke="color-mix(in srgb, var(--surface-border) 92%, var(--ground))" stroke-width="2.5" fill="none" opacity="0.55" stroke-linecap="round">
      <path d="M18 120 Q40 150 30 200"/>
      <path d="M40 320 Q22 380 44 440"/>
      <path d="M366 140 Q346 200 372 260"/>
      <path d="M356 400 Q378 470 352 540"/>
    </g>
    <g class="mine-stones" fill="color-mix(in srgb, var(--surface-border) 92%, var(--ground))" opacity="0.6">
      <ellipse cx="26" cy="500" rx="16" ry="11"/>
      <ellipse cx="372" cy="330" rx="14" ry="10"/>
      <ellipse cx="20" cy="640" rx="18" ry="12"/>
    </g>

    <!-- Cave FLOOR: bottom third, lighter rock than the walls so ducks read as
         standing on it. -->
    <path class="mine-floor" d="M0 620 Q200 592 400 620 L400 780 L0 780 Z"
      fill="color-mix(in srgb, var(--surface-border) 60%, var(--ground))"/>
    <path class="mine-floor-lit" d="M96 640 Q200 622 304 640 L332 780 L64 780 Z"
      fill="color-mix(in srgb, var(--scene-detail) 14%, color-mix(in srgb, var(--surface-border) 55%, var(--ground)))" opacity="0.7"/>

    <!-- Mine-cart rail: runs from the foreground floor up and OUT through the
         exit, perspective-narrowing toward the opening. Two rails + sleepers. -->
    <g class="mine-rail">
      <path d="M150 760 C168 560 182 400 188 300" fill="none" stroke="var(--surface-border)" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M262 760 C244 560 226 400 212 300" fill="none" stroke="var(--surface-border)" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="146" y1="740" x2="266" y2="740" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
      <line x1="152" y1="660" x2="260" y2="660" stroke="var(--surface-border)" stroke-width="5.5" stroke-linecap="round" opacity="0.82"/>
      <line x1="160" y1="560" x2="252" y2="560" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="168" y1="460" x2="244" y2="460" stroke="var(--surface-border)" stroke-width="4.5" stroke-linecap="round" opacity="0.78"/>
      <line x1="176" y1="380" x2="236" y2="380" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
      <line x1="184" y1="322" x2="228" y2="322" stroke="var(--surface-border)" stroke-width="3.5" stroke-linecap="round" opacity="0.72"/>
    </g>

    <!-- Wooden support beams (posts + lintel) bracing the passage to the exit -->
    <g class="mine-timber">
      <rect x="96" y="300" width="16" height="320" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="288" y="300" width="16" height="320" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="90" y="300" width="220" height="18" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2.5"/>
    </g>

    <!-- Ore veins glinting in the side walls: clusters of small crystals. The
         left cluster is the deep vein the ducks walk TO on hits (see
         .mine-cave-anchor). -->
    <g class="mine-veins">
      <!-- Left wall vein (walk target) -->
      <path class="twinkle" style="animation-delay:0.3s" d="M46 396 l4.5 -9 l4.5 9 l-4.5 9 z" fill="var(--gold)"/>
      <path d="M60 384 l3.6 -7 l3.6 7 l-3.6 7 z" fill="var(--gold)"/>
      <path class="twinkle" style="animation-delay:1.4s" d="M52 420 l4 -8 l4 8 l-4 8 z" fill="#7ad0e0"/>
      <path d="M38 430 l3.2 -6 l3.2 6 l-3.2 6 z" fill="var(--gold)"/>
      <path d="M66 412 l3 -6 l3 6 l-3 6 z" fill="#c77b4a"/>
      <!-- Right wall vein -->
      <path class="twinkle" style="animation-delay:2.1s" d="M350 300 l4.5 -9 l4.5 9 l-4.5 9 z" fill="var(--gold)"/>
      <path d="M338 320 l3.6 -7 l3.6 7 l-3.6 7 z" fill="#8a7ae0"/>
      <path d="M360 330 l3.2 -6 l3.2 6 l-3.2 6 z" fill="var(--gold)"/>
      <!-- Back-wall glint near the exit rim -->
      <path d="M150 306 l3 -6 l3 6 l-3 6 z" fill="var(--gold)"/>
      <path d="M244 306 l3 -6 l3 6 l-3 6 z" fill="var(--gold)"/>
    </g>

    <!-- Two static hanging lanterns INSIDE the cave (warm glow, brightens at
         night, NO motion). -->
    <g class="mine-lantern">
      <circle class="mine-lantern-glow" cx="128" cy="238" r="24" fill="var(--scene-detail)" opacity="0.18"/>
      <line x1="128" y1="184" x2="128" y2="216" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="118" y="216" width="20" height="26" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="1.8"/>
      <circle class="mine-lantern-light" cx="128" cy="229" r="5.5" fill="var(--scene-detail)"/>
    </g>
    <g class="mine-lantern">
      <circle class="mine-lantern-glow" cx="288" cy="250" r="22" fill="var(--scene-detail)" opacity="0.18"/>
      <line x1="288" y1="200" x2="288" y2="230" stroke="var(--surface-border)" stroke-width="2.5"/>
      <rect x="279" y="230" width="18" height="24" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="1.8"/>
      <circle class="mine-lantern-light" cx="288" cy="242" r="5" fill="var(--scene-detail)"/>
    </g>

    <!-- Scatter pebbles on the floor for texture -->
    <g class="mine-pebbles" fill="color-mix(in srgb, var(--surface-border) 70%, var(--ground))" opacity="0.7">
      <ellipse cx="96" cy="690" rx="14" ry="8"/>
      <ellipse cx="316" cy="700" rx="16" ry="9"/>
      <ellipse cx="140" cy="730" rx="10" ry="6"/>
      <ellipse cx="290" cy="742" rx="12" ry="7"/>
      <circle cx="208" cy="716" r="6"/>
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

// Screen-space center of the deep ore vein (the .mine-cave-anchor's rect,
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
