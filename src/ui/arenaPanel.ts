import { enemyAttackFor, enemyTypeForWave, isBossWave } from "../game/arena";
import { on } from "../game/events";
import { getStats } from "../game/state";
import type { GameState } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { makeDuckDraggable, makeDuckDropTarget } from "./dragDuck";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";

// UI maps enemy TYPE id → art colour (identity/names now live in game logic).
const ENEMY_COLORS: Record<string, string> = {
  "pond-slime": "#7aa85a",
  "angry-goose": "#d9d9e8",
  "breadcrumb-golem": "#c8a05a",
  "rubber-shark": "#5a9ad9",
  pondlord: "#8a5ad9",
};

// Arena clearing backdrop (Phase H, PLAN2.md world redesign): a static SVG
// scene sitting behind the enemy/team content via a negative z-index. Reads
// as a clearing on the backdrop's right — no sky paint of its own
// (transparent above the ground shapes) so it sits seamlessly over
// #world-backdrop. Two tiered stone stands with banner pennants sit behind
// a sandy floor (enemy side far/top, duck side near/bottom, matching DOM
// order); torches only glow at night, crowd dots cheer continuously.
function colosseumSceneSvg(): string {
  return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <!-- Tiered stone stands, far tier behind near tier -->
    <path class="arena-stand-far" d="M-20 40 Q200 -6 420 40 L420 78 Q200 40 -20 78 Z"
      fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))" opacity="0.85"/>
    <g class="arena-crenellation-far">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${-4 + i * 36}" y="4" width="18" height="14" fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))" opacity="0.85"/>`).join("")}
    </g>

    <path class="arena-stand-near" d="M-20 78 Q200 40 420 78 L420 122 Q200 88 -20 122 Z"
      fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))"/>
    <g class="arena-crenellation-near">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${-4 + i * 36}" y="42" width="20" height="16" fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))"/>`).join("")}
    </g>

    <!-- Banner pennants atop the stands -->
    <g class="arena-banners">
      <line x1="60" y1="8" x2="60" y2="46" stroke="var(--surface-border)" stroke-width="2.4"/>
      <polygon points="60,10 84,18 60,26" fill="var(--accent)"/>
      <line x1="200" y1="-2" x2="200" y2="40" stroke="var(--surface-border)" stroke-width="2.4"/>
      <polygon points="200,0 224,8 200,16" fill="var(--accent)"/>
      <line x1="340" y1="8" x2="340" y2="46" stroke="var(--surface-border)" stroke-width="2.4"/>
      <polygon points="340,10 316,18 340,26" fill="var(--accent)"/>
    </g>

    <!-- Crowd dots, always cheering -->
    <g class="crowd">
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${20 + i * 27}" cy="${58 - (i % 3) * 4}" r="4" fill="var(--accent)" opacity="0.5"/>`).join("")}
    </g>

    <!-- Torches: flame only shows/glows at night -->
    <g class="arena-torch" style="--torch-x:34px">
      <line x1="34" y1="150" x2="34" y2="210" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round"/>
      <path class="arena-flame" d="M34 150 q-8 -10 0 -22 q8 12 0 22 z" fill="var(--scene-detail)"/>
      <circle class="arena-flame-glow" cx="34" cy="140" r="16" fill="var(--scene-detail)" opacity="0.25"/>
    </g>
    <g class="arena-torch" style="--torch-x:366px">
      <line x1="366" y1="150" x2="366" y2="210" stroke="var(--surface-border)" stroke-width="4" stroke-linecap="round"/>
      <path class="arena-flame" d="M366 150 q-8 -10 0 -22 q8 12 0 22 z" fill="var(--scene-detail)"/>
      <circle class="arena-flame-glow" cx="366" cy="140" r="16" fill="var(--scene-detail)" opacity="0.25"/>
    </g>

    <!-- Sandy floor: enemy side far (top), duck side near (bottom) -->
    <ellipse cx="200" cy="240" rx="230" ry="66" fill="color-mix(in srgb, var(--gold) 18%, var(--ground))"
      stroke="var(--surface-border)" stroke-width="2"/>
  </svg>`;
}

let panel: HTMLElement;
let enemiesEl: HTMLElement;
let enemyNameEl: HTMLElement;
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
    <div class="area-chip">Arena <span class="panel-ticker" id="arena-ticker"></span></div>
    <div class="panel-body arena-body">
      <div class="arena-scene">${colosseumSceneSvg()}</div>
      <div class="mission-slot" id="arena-mission"></div>
      <div class="arena-enemy">
        <div class="enemy-name" id="enemy-name"></div>
        <div class="enemy-group" id="enemy-group"></div>
      </div>
      <div class="arena-team well">
        <div class="hp-bar team"><span class="hp-fill" id="team-hp"></span><span class="hp-label" id="team-hp-label"></span></div>
        <div class="duck-row" id="arena-ducks"></div>
      </div>
      <div class="arena-overlay" id="arena-overlay"></div>
    </div>
  `;
  enemiesEl = panel.querySelector("#enemy-group")!;
  enemyNameEl = panel.querySelector("#enemy-name")!;
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
    // Flash the first living enemy's portrait (ducks auto-target it).
    const artEl =
      enemiesEl.querySelector<HTMLElement>(".enemy-unit:not(.dead) .enemy-art") ??
      enemiesEl.querySelector<HTMLElement>(".enemy-art");
    if (artEl) retrigger(artEl, "flash");
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl) retrigger(duckEl, "lunge");
  });
  on("enemyhit", (e) => {
    retrigger(teamBarEl.parentElement as HTMLElement, e.isCrit ? "flash-crit" : "flash");
  });
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function enemySvg(typeId: string, size: number, boss: boolean): string {
  const color = ENEMY_COLORS[typeId] ?? "#7aa85a";
  return `<svg viewBox="0 0 120 100" width="${size}" height="${(size * 100) / 120}" role="img" aria-label="enemy">
    ${boss ? `<polygon points="42,22 50,8 60,20 70,8 78,22" fill="#f5c518"/>` : ""}
    <path d="M20 80 q-6 -35 20 -50 q22 -14 44 2 q22 16 16 48 q-40 14 -80 0 z" fill="${color}"/>
    <circle cx="47" cy="55" r="4" fill="#1a1a1a"/>
    <circle cx="75" cy="55" r="4" fill="#1a1a1a"/>
    <path d="M50 70 q11 6 22 0" stroke="#1a1a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// The wave the on-screen enemies belong to: during the between-wave pause
// arena.wave has already advanced but the (dead) previous group is still
// shown, so derive from the group's type id, not the wave counter.
function displayedWave(state: GameState): number {
  const arena = state.arena;
  if (arena.retryAt === 0 || arena.enemies.length === 0) return arena.wave;
  return enemyTypeForWave(arena.wave).id === arena.enemies[0].id ? arena.wave : arena.wave - 1;
}

// Key that changes whenever the portraits must be rebuilt.
function enemyKey(state: GameState): string {
  return `${displayedWave(state)}:${state.arena.enemies.length}`;
}

function renderEnemy(state: GameState): void {
  const arena = state.arena;
  const wave = displayedWave(state);
  const boss = isBossWave(wave);
  const type = enemyTypeForWave(wave);
  const count = arena.enemies.length;
  const portraitSize = count >= 3 ? 66 : count === 2 ? 88 : 120;

  const label = count > 1 ? `${type.name} ×${count}` : type.name;
  enemyNameEl.innerHTML = `${boss ? "👑 " : ""}${label} <small>· Wave ${wave} · atk ${fmt(enemyAttackFor(wave))}</small>`;

  enemiesEl.innerHTML = arena.enemies
    .map(
      (_, i) => `
      <div class="enemy-unit" data-enemy="${i}">
        <div class="enemy-art">${enemySvg(type.id, portraitSize, boss)}</div>
        <div class="hp-bar enemy mini"><span class="hp-fill" data-enemy-hp="${i}"></span></div>
      </div>`,
    )
    .join("");
  lastEnemyKey = enemyKey(state);
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
        `<div class="duck-slot fighter" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 64, { ascension, ringed: false })}</div>`,
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
      makeDuckDraggable(slot, defId, state);
    }
    makeDuckDropTarget(slot, "arena", Number(slot.dataset.slot), state);
  });
  lastRosterKey = rosterKey(state);
}

export function renderArenaPanel(state: GameState): void {
  if (rosterKey(state) !== lastRosterKey) renderRoster(state);
  if (enemyKey(state) !== lastEnemyKey) renderEnemy(state);
  tickerEl.textContent = `Wave ${state.arena.wave}`;
  renderMissionTracker("arena", missionEl, state);

  const a = state.arena;
  a.enemies.forEach((enemy, i) => {
    const unit = enemiesEl.querySelector<HTMLElement>(`.enemy-unit[data-enemy="${i}"]`);
    const fill = enemiesEl.querySelector<HTMLElement>(`[data-enemy-hp="${i}"]`);
    if (fill) {
      fill.style.width = `${enemy.maxHp > 0 ? Math.max((enemy.hp / enemy.maxHp) * 100, 0) : 0}%`;
    }
    if (unit) unit.classList.toggle("dead", enemy.hp <= 0);
  });
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
