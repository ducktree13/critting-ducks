import { ORE_VALUES } from "../game/balance";
import { getDuckDef } from "../game/ducks";
import { on } from "../game/events";
import { getStats, refreshStats } from "../game/state";
import type { GameState, OreId } from "../game/types";
import { duckSvg } from "./duckArt";
import { fmt } from "./format";
import { openRosterPicker } from "./rosterPicker";

const ORE_COLORS: Record<OreId, string> = {
  copper: "#c77b4a",
  silver: "#b8bec9",
  crystal: "#7ad0e0",
  starmetal: "#8a7ae0",
};

const ORE_NAMES: Record<OreId, string> = {
  copper: "Copper",
  silver: "Silver",
  crystal: "Crystal",
  starmetal: "Starmetal",
};

const ORE_UNLOCK_HINT: Record<OreId, string> = {
  copper: "",
  silver: "Silver Vein node",
  crystal: "Crystal Cavern node",
  starmetal: "Starmetal Seam node",
};

let panel: HTMLElement;
let rockEl: HTMLElement;
let duckRowEl: HTMLElement;
let oreCountersEl: HTMLElement;
let veinsEl: HTMLElement;
let lastRosterKey = "";

export function initMinePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  panel.innerHTML = `
    <h2>Mine</h2>
    <div class="panel-body mine-body">
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

  renderVeins(state);
  renderRoster(state);

  // Ore unlock nodes change which veins are selectable; the tick-cached
  // stats snapshot doesn't include the new node yet, so refresh first.
  on("buy", () => {
    refreshStats(state, Date.now());
    renderVeins(state);
  });

  on("hit", (e) => {
    if (e.panel !== "mine") return;
    retrigger(rockEl, "shake");
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) retrigger(duckEl, "lunge");
  });
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
        return `<button class="vein locked" disabled title="Unlock: ${ORE_UNLOCK_HINT[ore]}">🔒 ${ORE_NAMES[ore]}</button>`;
      }
      return `<button class="vein${active ? " active" : ""}" data-ore="${ore}">${ORE_NAMES[ore]} <small>${ORE_VALUES[ore]}g</small></button>`;
    })
    .join("");

  veinsEl.querySelectorAll<HTMLButtonElement>(".vein[data-ore]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedOre = btn.dataset.ore as OreId;
      renderVeins(state);
      rockEl.innerHTML = rockSvg(state.selectedOre);
    });
  });

  rockEl.innerHTML = rockSvg(state.selectedOre);
}

function renderRoster(state: GameState): void {
  const stats = getStats(state);
  const slots: string[] = [];
  for (let i = 0; i < stats.mineSlots; i++) {
    const defId = state.rosters.mine[i];
    if (defId) {
      slots.push(
        `<div class="duck-slot" data-duck="${defId}" data-slot="${i}" title="${getDuckDef(defId).name} — click to change">${duckSvg(defId, 64)}</div>`,
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
  });
  lastRosterKey = rosterKey(state);
}

function rosterKey(state: GameState): string {
  return state.rosters.mine.join(",") + "|" + getStats(state).mineSlots;
}

export function renderMinePanel(state: GameState): void {
  if (rosterKey(state) !== lastRosterKey) renderRoster(state);
  oreCountersEl.innerHTML = (Object.keys(ORE_VALUES) as OreId[])
    .filter((ore) => state.ores[ore] > 0)
    .map((ore) => `<span class="ore-counter">${ORE_NAMES[ore]}: ${fmt(state.ores[ore])}</span>`)
    .join("");
}
