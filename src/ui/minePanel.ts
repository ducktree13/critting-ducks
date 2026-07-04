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

// Cave-mouth backdrop (PLAN2.md §12): a static SVG scene sitting behind the
// rock/vein/duck-row content via a negative z-index, so ducks read as
// walking a loop in front of a cave rather than floating on blank panel bg.
function caveSceneSvg(): string {
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <radialGradient id="cave-mouth" cx="50%" cy="20%" r="80%">
        <stop offset="0%" stop-color="#000" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="M0 260 L0 150 Q60 40 200 20 Q340 40 400 150 L400 260 Z" fill="var(--card-border)" opacity="0.5"/>
    <ellipse cx="200" cy="70" rx="120" ry="60" fill="url(#cave-mouth)"/>
    <path d="M90 130 Q200 95 310 130 L300 170 Q200 145 100 170 Z" fill="var(--card-border)" opacity="0.7"/>
  </svg>`;
}

export function initMinePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  panel.innerHTML = `
    <h2>Mine <span class="panel-ticker" id="mine-ticker"></span></h2>
    <div class="panel-body mine-body">
      <div class="mine-scene">${caveSceneSvg()}</div>
      <div class="mission-slot" id="mine-mission"></div>
      <div class="mine-rock" id="mine-rock"></div>
      <div class="vein-row" id="vein-row"></div>
      <div class="duck-row" id="mine-ducks"></div>
      <div class="ore-counters" id="ore-counters"></div>
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
    <polygon points="30,140 12,90 45,40 100,18 160,38 188,95 168,140" fill="#8a8578"/>
    <polygon points="60,120 50,85 80,60 120,55 145,85 135,120" fill="${c}"/>
    <polygon points="80,95 95,72 118,80 110,102" fill="#ffffff" opacity="0.35"/>
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
