import { enemyAttackAt, isBossWave } from "../game/arena";
import { on } from "../game/events";
import { getStats } from "../game/state";
import type { GameState } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";

const ENEMY_NAMES = ["Pond Slime", "Angry Goose", "Breadcrumb Golem", "Rubber Shark"];
const BOSS_NAME = "The Pondlord";
const ENEMY_COLORS = ["#7aa85a", "#d9d9e8", "#c8a05a", "#5a9ad9"];
const BOSS_COLOR = "#8a5ad9";

// Colosseum backdrop (PLAN2.md §12): tiered stands + a sandy floor, sitting
// behind the enemy/team content via a negative z-index. The `.expanded`
// modifier (toggled by layout.ts when mine+tree are both minimized) scales
// the scene up and animates the crowd for the "full scene" version.
function colosseumSceneSvg(): string {
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M-20 40 Q200 -10 420 40 L420 90 Q200 45 -20 90 Z" fill="var(--card-border)" opacity="0.55"/>
    <path d="M-20 90 Q200 45 420 90 L420 135 Q200 92 -20 135 Z" fill="var(--card-border)" opacity="0.4"/>
    <g class="crowd">
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${20 + i * 27}" cy="${58 - (i % 3) * 4}" r="4" fill="var(--accent)" opacity="0.5"/>`).join("")}
    </g>
    <ellipse cx="200" cy="230" rx="220" ry="60" fill="var(--accent)" opacity="0.12"/>
  </svg>`;
}

let panel: HTMLElement;
let enemyArtEl: HTMLElement;
let enemyNameEl: HTMLElement;
let enemyBarEl: HTMLElement;
let enemyBarLabelEl: HTMLElement;
let teamBarEl: HTMLElement;
let teamBarLabelEl: HTMLElement;
let duckRowEl: HTMLElement;
let overlayEl: HTMLElement;
let tickerEl: HTMLElement;
let missionEl: HTMLElement;
let lastRosterKey = "";
let lastEnemyKey = "";

export function initArenaPanel(root: HTMLElement, state: GameState): void {
  panel = root;
  panel.innerHTML = `
    <h2>Arena <span class="panel-ticker" id="arena-ticker"></span></h2>
    <div class="panel-body arena-body">
      <div class="arena-scene">${colosseumSceneSvg()}</div>
      <div class="mission-slot" id="arena-mission"></div>
      <div class="arena-enemy">
        <div class="enemy-name" id="enemy-name"></div>
        <div class="enemy-art" id="enemy-art"></div>
        <div class="hp-bar enemy"><span class="hp-fill" id="enemy-hp"></span><span class="hp-label" id="enemy-hp-label"></span></div>
      </div>
      <div class="arena-team">
        <div class="hp-bar team"><span class="hp-fill" id="team-hp"></span><span class="hp-label" id="team-hp-label"></span></div>
        <div class="duck-row" id="arena-ducks"></div>
      </div>
      <div class="arena-overlay" id="arena-overlay"></div>
    </div>
  `;
  enemyArtEl = panel.querySelector("#enemy-art")!;
  enemyNameEl = panel.querySelector("#enemy-name")!;
  enemyBarEl = panel.querySelector("#enemy-hp")!;
  enemyBarLabelEl = panel.querySelector("#enemy-hp-label")!;
  teamBarEl = panel.querySelector("#team-hp")!;
  teamBarLabelEl = panel.querySelector("#team-hp-label")!;
  duckRowEl = panel.querySelector("#arena-ducks")!;
  overlayEl = panel.querySelector("#arena-overlay")!;
  tickerEl = panel.querySelector("#arena-ticker")!;
  missionEl = panel.querySelector("#arena-mission")!;

  renderRoster(state);
  renderEnemy(state);

  on("hit", (e) => {
    if (e.panel !== "arena") return;
    retrigger(enemyArtEl, "flash");
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) retrigger(duckEl, "lunge");
  });
  on("enemyhit", () => {
    retrigger(teamBarEl.parentElement as HTMLElement, "flash");
  });
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function enemySvg(wave: number): string {
  const boss = isBossWave(wave);
  const color = boss ? BOSS_COLOR : ENEMY_COLORS[(wave - 1) % ENEMY_COLORS.length];
  return `<svg viewBox="0 0 120 100" width="120" height="100" role="img" aria-label="enemy">
    ${boss ? `<polygon points="42,22 50,8 60,20 70,8 78,22" fill="#f5c518"/>` : ""}
    <path d="M20 80 q-6 -35 20 -50 q22 -14 44 2 q22 16 16 48 q-40 14 -80 0 z" fill="${color}"/>
    <circle cx="47" cy="55" r="4" fill="#1a1a1a"/>
    <circle cx="75" cy="55" r="4" fill="#1a1a1a"/>
    <path d="M50 70 q11 6 22 0" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function enemyName(wave: number): string {
  return isBossWave(wave) ? BOSS_NAME : ENEMY_NAMES[(wave - 1) % ENEMY_NAMES.length];
}

function renderEnemy(state: GameState): void {
  const wave = state.arena.wave;
  enemyNameEl.innerHTML = `${isBossWave(wave) ? "👑 " : ""}${enemyName(wave)} <small>· Wave ${wave} · atk ${fmt(enemyAttackAt(wave))}</small>`;
  enemyArtEl.innerHTML = enemySvg(wave);
  lastEnemyKey = String(wave);
}

function rosterKey(state: GameState): string {
  return state.rosters.arena.join(",") + "|" + getStats(state).arenaSlots;
}

function renderRoster(state: GameState): void {
  const stats = getStats(state);
  const slots: string[] = [];
  for (let i = 0; i < stats.arenaSlots; i++) {
    const defId = state.rosters.arena[i];
    if (defId) {
      const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
      slots.push(
        `<div class="duck-slot fighter" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 64, ascension)}</div>`,
      );
    } else {
      slots.push(`<div class="duck-slot empty" data-slot="${i}" title="Assign a duck">+</div>`);
    }
  }
  duckRowEl.innerHTML = slots.join("");
  duckRowEl.querySelectorAll<HTMLElement>(".duck-slot").forEach((slot) => {
    slot.addEventListener("click", () =>
      openRosterPicker(state, "arena", Number(slot.dataset.slot)),
    );
    const defId = slot.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(slot, () => duckTooltipHtml(state, duck));
    }
  });
  lastRosterKey = rosterKey(state);
}

export function renderArenaPanel(state: GameState): void {
  if (rosterKey(state) !== lastRosterKey) renderRoster(state);
  if (String(state.arena.wave) !== lastEnemyKey) renderEnemy(state);
  tickerEl.textContent = `Wave ${state.arena.wave}`;
  renderMissionTracker("arena", missionEl, state);

  const a = state.arena;
  enemyBarEl.style.width = `${a.enemyMaxHp > 0 ? Math.max((a.enemyHp / a.enemyMaxHp) * 100, 0) : 0}%`;
  enemyBarLabelEl.textContent = `${fmt(Math.max(a.enemyHp, 0))} / ${fmt(a.enemyMaxHp)}`;
  teamBarEl.style.width = `${a.teamMaxHp > 0 ? Math.max((a.teamHp / a.teamMaxHp) * 100, 0) : 0}%`;
  teamBarLabelEl.textContent = `${fmt(Math.max(a.teamHp, 0))} / ${fmt(a.teamMaxHp)}`;

  if (state.rosters.arena.length === 0) {
    overlayEl.textContent = "Assign a duck to fight";
    overlayEl.classList.add("show");
  } else if (a.retryAt > 0) {
    const secs = Math.max((a.retryAt - Date.now()) / 1000, 0);
    if (a.teamHp <= 0) {
      overlayEl.textContent = `Defeated! Retrying in ${secs.toFixed(1)}s`;
      overlayEl.classList.add("show");
    } else {
      overlayEl.textContent = `Wave ${a.wave} incoming…`;
      overlayEl.classList.add("show");
    }
  } else {
    overlayEl.classList.remove("show");
  }
}
