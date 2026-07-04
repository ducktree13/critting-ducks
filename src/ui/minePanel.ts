import { ORE_LEVEL_GATES, ORE_VALUES } from "../game/balance";
import { on } from "../game/events";
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
let goldTargetEl: HTMLElement | null = null;
let lastRosterKey = "";
let lastOreCountersKey = "";

// Mine hillside backdrop (Phase H, PLAN2.md world redesign): a static SVG
// scene sitting behind the rock/vein/duck-row content via a negative
// z-index. Reads as the near face of the world backdrop's left hillside —
// no sky paint of its own (transparent above the hill shapes) so it sits
// seamlessly over #world-backdrop, with a timber-framed cave mouth, a
// mine-cart rail leading in, ore sparkles on the hill face, and a lantern
// by the mouth that brightens at night.
function caveSceneSvg(): string {
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="cave-mouth" cx="50%" cy="15%" r="85%">
        <stop offset="0%" stop-color="#000" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>

    <!-- Hill mass: near face of the backdrop's left hillside, strata bands -->
    <path class="mine-hill" d="M0 260 L0 120 Q70 30 200 14 Q330 30 400 120 L400 260 Z"
      fill="color-mix(in srgb, var(--surface-border) 40%, var(--ground))"/>
    <path class="mine-strata" d="M0 150 Q100 118 200 128 Q300 118 400 150 L400 165 Q300 133 200 143 Q100 133 0 165 Z"
      fill="color-mix(in srgb, var(--surface-border) 30%, var(--ground))" opacity="0.6"/>
    <path class="mine-strata" d="M0 190 Q100 162 200 170 Q300 162 400 190 L400 204 Q300 176 200 184 Q100 176 0 204 Z"
      fill="color-mix(in srgb, var(--surface-border) 24%, var(--ground))" opacity="0.55"/>

    <!-- Mine-cart rail: two rails + sleepers, running from the duck row into the mouth -->
    <g class="mine-rail">
      <line x1="70" y1="256" x2="185" y2="180" stroke="var(--surface-border)" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="330" y1="256" x2="215" y2="180" stroke="var(--surface-border)" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="92" y1="240" x2="308" y2="240" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
      <line x1="106" y1="220" x2="294" y2="220" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
      <line x1="122" y1="200" x2="278" y2="200" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
      <line x1="140" y1="184" x2="260" y2="184" stroke="var(--surface-border)" stroke-width="5" stroke-linecap="round" opacity="0.85"/>
    </g>

    <!-- Timber posts + lintel framing the cave mouth -->
    <g class="mine-timber">
      <rect x="112" y="90" width="14" height="100" rx="3" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
      <rect x="274" y="90" width="14" height="100" rx="3" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
      <rect x="104" y="78" width="192" height="18" rx="4" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="2"/>
    </g>

    <!-- Cave mouth: dark opening with depth gradient -->
    <path d="M118 190 Q200 70 282 190 L282 96 Q200 88 118 96 Z"
      fill="color-mix(in srgb, var(--surface-border) 75%, var(--ground))"/>
    <ellipse cx="200" cy="120" rx="82" ry="56" fill="url(#cave-mouth)"/>

    <!-- Hanging lantern beside the mouth -->
    <g class="mine-lantern">
      <circle class="mine-lantern-glow" cx="300" cy="130" r="22" fill="var(--scene-detail)" opacity="0.18"/>
      <line x1="300" y1="96" x2="300" y2="112" stroke="var(--surface-border)" stroke-width="2"/>
      <rect x="292" y="112" width="16" height="20" rx="3" fill="var(--bark-light)" stroke="var(--surface-border)" stroke-width="1.6"/>
      <circle class="mine-lantern-light" cx="300" cy="122" r="4.5" fill="var(--scene-detail)"/>
    </g>

    <!-- Ore sparkles scattered on the hill face -->
    <g class="mine-sparkles">
      <path class="twinkle" style="animation-delay:0.4s" d="M48 172 l4 -8 l4 8 l-4 8 z" fill="var(--gold)"/>
      <path d="M66 200 l3.4 -7 l3.4 7 l-3.4 7 z" fill="var(--gold)"/>
      <path class="twinkle" style="animation-delay:1.5s" d="M340 168 l4 -8 l4 8 l-4 8 z" fill="var(--gold)"/>
      <path d="M362 210 l3 -6 l3 6 l-3 6 z" fill="var(--gold)"/>
      <path d="M28 224 l3.4 -7 l3.4 7 l-3.4 7 z" fill="var(--gold)"/>
    </g>
  </svg>`;
}

export function initMinePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  panel.innerHTML = `
    <div class="area-chip">Mine <span class="panel-ticker" id="mine-ticker"></span></div>
    <div class="panel-body mine-body">
      <div class="mine-scene">${caveSceneSvg()}</div>
      <div class="mission-slot" id="mine-mission"></div>
      <div class="mine-rock" id="mine-rock"></div>
      <div class="vein-row well" id="vein-row"></div>
      <div class="duck-row" id="mine-ducks"></div>
      <div class="ore-counters well" id="ore-counters"></div>
    </div>
  `;
  rockEl = panel.querySelector("#mine-rock")!;
  duckRowEl = panel.querySelector("#mine-ducks")!;
  oreCountersEl = panel.querySelector("#ore-counters")!;
  veinsEl = panel.querySelector("#vein-row")!;
  tickerEl = panel.querySelector("#mine-ticker")!;
  missionEl = panel.querySelector("#mine-mission")!;
  goldTargetEl = document.querySelector("#hud-gold-amount");

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
    retrigger(rockEl, "shake");
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) {
      retrigger(duckEl, "walk-cycle");
      spawnOrePip(duckEl);
    }
  });
}

const MAX_PIPS = 16;
const livePips: HTMLElement[] = [];

// A small ore pip that flies from the depositing duck to the HUD gold
// counter (PLAN2.md §12: "deposit it on a stockpile, pip flies to the HUD
// gold counter"). Capped like floaters.ts so a fast crit streak can't spam
// unbounded DOM nodes.
function spawnOrePip(duckEl: HTMLElement): void {
  if (!goldTargetEl) return;
  if (livePips.length >= MAX_PIPS) return;
  const from = duckEl.getBoundingClientRect();
  const to = goldTargetEl.getBoundingClientRect();

  const pip = document.createElement("div");
  pip.className = "ore-pip";
  pip.style.left = `${from.left + from.width / 2}px`;
  pip.style.top = `${from.top + from.height / 2}px`;
  document.body.appendChild(pip);
  livePips.push(pip);

  requestAnimationFrame(() => {
    pip.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(0.3)`;
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
        `<div class="duck-slot" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 64, { ascension, ringed: false })}</div>`,
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
