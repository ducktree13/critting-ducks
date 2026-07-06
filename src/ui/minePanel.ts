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

// Mine TUNNEL (Phase W1, playtest re-author): a static SVG scene sitting behind
// the rock/vein/duck-row content via a negative z-index. The camera now looks
// DOWN a tunnel that recedes INTO the screen — WIDE at the bottom (near the
// viewer) and NARROWING toward the top (the deep end). Dark rock walls converge
// trapezoidally as they rise; the ceiling closes in at the top; darkness deepens
// toward the top (deepest = darkest). The ORE ROCK lives at the BACK of the
// tunnel (top ~25%, positioned via CSS on .mine-rock), lit by a hanging lantern
// with warm STATIC glow and surrounded by vein glints. Cart rails run straight
// up the middle from the near edge to the rock, converging with perspective.
// The near floor (bottom) is wider and slightly brighter — a soft light wash
// implies the entrance BEHIND the camera. Ducks stand on the near floor.
//
// The container (.mine-scene) is tall (~373x744 in the world layout), so the
// viewBox is authored TALL (400x780). All KEY content (back wall / rock zone,
// rails, veins, lantern) sits within a safe central column (~x=60..340) so the
// width `slice` crop (at 1100-1600px) only ever trims the outer wall margins.
//
// Perspective vanishing geometry (referenced by walls, rails, ceiling):
//   near floor edge  y=780, tunnel spans x=0..400
//   back wall        y≈150, tunnel spans x≈150..250 (converged)
function caveSceneSvg(): string {
  return `<svg viewBox="0 0 400 780" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="mine-depth" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="color-mix(in srgb, var(--surface-border) 96%, black)"/>
        <stop offset="30%" stop-color="color-mix(in srgb, var(--surface-border) 88%, var(--ground))"/>
        <stop offset="100%" stop-color="color-mix(in srgb, var(--surface-border) 62%, var(--ground))"/>
      </linearGradient>
      <radialGradient id="mine-lantern-pool" cx="50%" cy="42%" r="60%">
        <stop offset="0%" stop-color="var(--scene-detail)" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="var(--scene-detail)" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Tunnel void: the receding shaft. A dark gradient, darkest at the deep
         (top) end, that the converging walls frame. -->
    <path class="mine-tunnel" fill="url(#mine-depth)"
      d="M150 150 L250 150 L400 780 L0 780 Z"/>

    <!-- LEFT wall: dark rock angling inward as it rises to the deep end. Outer
         edge is the viewport border; inner edge follows the tunnel taper. -->
    <path class="mine-wall" fill="color-mix(in srgb, var(--surface-border) 84%, var(--ground))"
      d="M0 0 L0 780 L0 780 L150 150 L150 0 Z
         M0 780 L150 150 L172 150 L64 780 Z"/>
    <path class="mine-wall mine-wall-left" fill="color-mix(in srgb, var(--surface-border) 84%, var(--ground))"
      d="M0 0 L172 0 L172 150 L64 780 L0 780 Z"/>
    <!-- RIGHT wall (mirror) -->
    <path class="mine-wall mine-wall-right" fill="color-mix(in srgb, var(--surface-border) 84%, var(--ground))"
      d="M400 0 L228 0 L228 150 L336 780 L400 780 Z"/>
    <!-- CEILING: closes in across the top, darkest of all. -->
    <path class="mine-ceiling" fill="color-mix(in srgb, var(--surface-border) 92%, black)"
      d="M0 0 L400 0 L400 780 L336 780 L228 150 L172 150 L64 780 L0 780 Z" opacity="0"/>
    <path class="mine-ceiling-cap" fill="color-mix(in srgb, var(--surface-border) 92%, black)"
      d="M0 0 L400 0 L228 150 L172 150 Z"/>

    <!-- Lit inner-wall facets: a softer, warmer rim where the lantern glow
         catches the converging rock near the deep end, so the walls don't read
         as a flat cutout. -->
    <path class="mine-wall-rim" fill="color-mix(in srgb, var(--surface-border) 60%, var(--ground))" opacity="0.55"
      d="M172 150 L200 150 L146 420 L110 420 Z"/>
    <path class="mine-wall-rim" fill="color-mix(in srgb, var(--surface-border) 60%, var(--ground))" opacity="0.55"
      d="M228 150 L200 150 L254 420 L290 420 Z"/>

    <!-- Strata cracks embedded in the converging side walls (angled with the
         perspective, thinning toward the deep end). -->
    <g class="mine-strata" stroke="color-mix(in srgb, var(--surface-border) 94%, var(--ground))" stroke-width="2.5" fill="none" opacity="0.5" stroke-linecap="round">
      <path d="M30 300 Q70 320 44 420"/>
      <path d="M24 560 Q80 600 40 700"/>
      <path d="M370 300 Q330 320 356 420"/>
      <path d="M376 560 Q320 600 360 700"/>
    </g>
    <g class="mine-stones" fill="color-mix(in srgb, var(--surface-border) 94%, var(--ground))" opacity="0.6">
      <ellipse cx="30" cy="480" rx="16" ry="11"/>
      <ellipse cx="372" cy="500" rx="15" ry="10"/>
      <ellipse cx="24" cy="660" rx="18" ry="12"/>
    </g>

    <!-- BACK WALL of the tunnel: the deep end where the ore rock is embedded
         (the .mine-rock element sits over this via CSS). Slightly lit by the
         lantern so it reads as solid rock, not void. -->
    <path class="mine-backwall" fill="color-mix(in srgb, var(--surface-border) 78%, var(--ground))"
      d="M150 150 L250 150 L262 236 L138 236 Z"/>
    <circle class="mine-lantern-pool" cx="200" cy="196" r="90" fill="url(#mine-lantern-pool)"/>

    <!-- NEAR FLOOR: wide, slightly brighter foreground rock. Ducks stand here.
         A soft light wash at the bottom edge implies the entrance behind the
         camera. -->
    <path class="mine-floor" d="M0 640 L64 640 Q200 620 336 640 L400 640 L400 780 L0 780 Z"
      fill="color-mix(in srgb, var(--surface-border) 55%, var(--ground))"/>
    <path class="mine-floor-lit" d="M0 720 L400 720 L400 780 L0 780 Z"
      fill="var(--scene-detail)" opacity="0.09"/>

    <!-- Cart rails: run straight up the middle from the near edge to the rock at
         the back, converging with the perspective (the "trail" linking ducks to
         the rock they mine). Two rails + sleepers narrowing toward the top. -->
    <g class="mine-rail">
      <path d="M126 780 L190 176" fill="none" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round"/>
      <path d="M274 780 L210 176" fill="none" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round"/>
      <line x1="118" y1="760" x2="282" y2="760" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
      <line x1="140" y1="640" x2="260" y2="640" stroke="var(--surface-border)" stroke-width="5.5" stroke-linecap="round" opacity="0.82"/>
      <line x1="156" y1="520" x2="244" y2="520" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.8"/>
      <line x1="168" y1="420" x2="232" y2="420" stroke="var(--surface-border)" stroke-width="4.5" stroke-linecap="round" opacity="0.78"/>
      <line x1="178" y1="330" x2="222" y2="330" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
      <line x1="186" y1="250" x2="214" y2="250" stroke="var(--surface-border)" stroke-width="3.5" stroke-linecap="round" opacity="0.72"/>
    </g>

    <!-- Wooden support beams framing the lower (near) walls, receding with
         perspective. -->
    <g class="mine-timber">
      <path d="M70 760 L120 400 L136 400 L82 760 Z" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
      <path d="M330 760 L280 400 L264 400 L318 760 Z" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
      <path d="M66 720 L334 720 L318 700 L82 700 Z" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
    </g>

    <!-- Ore-vein glints clustered around the rock at the deep end (gold +
         ore-tinted crystals, a couple twinkling). -->
    <g class="mine-veins">
      <path class="twinkle" style="animation-delay:0.3s" d="M158 190 l4 -8 l4 8 l-4 8 z" fill="var(--gold)"/>
      <path d="M170 176 l3.2 -6 l3.2 6 l-3.2 6 z" fill="var(--gold)"/>
      <path class="twinkle" style="animation-delay:1.4s" d="M236 186 l4 -8 l4 8 l-4 8 z" fill="#7ad0e0"/>
      <path d="M248 174 l3.2 -6 l3.2 6 l-3.2 6 z" fill="#c77b4a"/>
      <path d="M150 214 l3 -6 l3 6 l-3 6 z" fill="var(--gold)"/>
      <path d="M252 214 l3 -6 l3 6 l-3 6 z" fill="#8a7ae0"/>
    </g>

    <!-- One static hanging lantern lighting the deep end (warm glow, brightens
         at night, NO motion). -->
    <g class="mine-lantern">
      <line x1="200" y1="150" x2="200" y2="164" stroke="var(--surface-border)" stroke-width="2"/>
      <rect x="192" y="164" width="16" height="20" rx="3" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="1.6"/>
      <circle class="mine-lantern-glow" cx="200" cy="174" r="20" fill="var(--scene-detail)" opacity="0.22"/>
      <circle class="mine-lantern-light" cx="200" cy="174" r="4.5" fill="var(--scene-detail)"/>
    </g>

    <!-- Scatter pebbles on the near floor for texture -->
    <g class="mine-pebbles" fill="color-mix(in srgb, var(--surface-border) 68%, var(--ground))" opacity="0.7">
      <ellipse cx="80" cy="700" rx="14" ry="8"/>
      <ellipse cx="330" cy="710" rx="16" ry="9"/>
      <ellipse cx="150" cy="748" rx="10" ry="6"/>
      <ellipse cx="286" cy="752" rx="12" ry="7"/>
      <circle cx="208" cy="726" r="6"/>
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
    else shakeRockAndDeposit();
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

// Strike feedback shared by the walk (on arrival) and the reduced-motion /
// no-duck fallback: the ROCK shakes and an ore pip launches from the rock to
// the HUD gold counter. Vein SELECTION must NOT call this — selecting a vein
// only swaps colors (no shake).
function shakeRockAndDeposit(): void {
  retrigger(rockEl, "shake");
  spawnOrePip();
}

// PLAN2.md §12 / Phase W1: on a mining hit the hitting duck walks UP the rail
// toward the ore rock at the deep end (top-center), shrinking + darkening as it
// recedes. On ARRIVAL (~55% of the trip) the ROCK shakes and the ore pip
// launches from the rock back to the HUD; the duck then returns to its slot. A
// CSS transition drives translate/scale/brightness via custom properties.
// Respects prefers-reduced-motion (skips the walk, still shakes + flies a pip).
function walkIntoCave(duckEl: HTMLElement, duckId: string): void {
  if (prefersReducedMotion) {
    shakeRockAndDeposit();
    return;
  }
  if (walking.has(duckId)) return;

  let vec = walkVectors.get(duckId);
  if (!vec) {
    const from = duckEl.getBoundingClientRect();
    const rock = caveMouthPoint();
    vec = {
      dx: rock.x - (from.left + from.width / 2),
      dy: rock.y - (from.top + from.height / 2),
    };
    walkVectors.set(duckId, vec);
  }

  walking.add(duckId);
  duckEl.classList.add("mine-walking");
  // Enter leg: travel ~80% of the vector up to the rock, shrink (depth) + darken.
  duckEl.style.setProperty("--walk-x", `${vec.dx * 0.8}px`);
  duckEl.style.setProperty("--walk-y", `${vec.dy * 0.8}px`);
  duckEl.style.setProperty("--walk-scale", "0.55");
  duckEl.style.setProperty("--walk-bright", "0.55");

  // On arrival (~55% through), the duck strikes: the rock shakes and the ore
  // pip launches from the rock. The duck then heads back to its slot.
  const returnTimer = window.setTimeout(() => {
    duckEl.style.setProperty("--walk-x", "0px");
    duckEl.style.setProperty("--walk-y", "0px");
    duckEl.style.setProperty("--walk-scale", "1");
    duckEl.style.setProperty("--walk-bright", "1");
    shakeRockAndDeposit();
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
      // Vein select just swaps the rock's ore colors — the shake is reserved
      // for actual mining strikes (shakeRockAndDeposit on hit arrival).
      rockEl.innerHTML = rockSvg(state.selectedOre);
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
