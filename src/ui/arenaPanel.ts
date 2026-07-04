import { enemyAttackFor, enemyTypeForWave, isBossWave } from "../game/arena";
import { on } from "../game/events";
import { equippedItemsFor } from "../game/gear";
import { getStats } from "../game/state";
import type { GameState } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { makeDuckDraggable, makeDuckDropTarget } from "./dragDuck";
import { setArenaEnemyTargetResolver, spawnImpactBurst } from "./floaters";
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

// Arena colosseum backdrop (Phase H + R4b, PLAN2.md world redesign): a static
// SVG scene sitting behind the battlefield content via a negative z-index.
// Reads as a colosseum — no sky paint of its own (transparent above the stand
// shapes) so it sits seamlessly over #world-backdrop. The container
// (.arena-scene) is TALL (~373x744 in the world layout), so the viewBox is
// authored TALL (400x780) to match; earlier the 400x260 wide viewBox scaled
// up under `slice` and cropped the whole composition off-frame. All KEY
// content (stands, pennants, torches, floor) sits within a safe central
// column (~x=60..340) so the width `slice` crops only ever trim empty margins.
// Top→bottom: two tiered crenellated stone stands with banner pennants across
// the top third, always-cheering crowd dots; a big sandy floor ellipse filling
// the bottom half (this IS the battlefield ground the ducks/enemies stand on);
// torches flank the floor (night-only flame/glow).
function colosseumSceneSvg(): string {
  return `<svg viewBox="0 0 400 780" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <!-- Tiered stone stands across the top third, far tier behind near tier -->
    <path class="arena-stand-far" d="M-20 120 Q200 40 420 120 L420 190 Q200 118 -20 190 Z"
      fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))" opacity="0.85"/>
    <g class="arena-crenellation-far">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${-4 + i * 36}" y="60" width="18" height="20" fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))" opacity="0.85"/>`).join("")}
    </g>

    <path class="arena-stand-near" d="M-20 190 Q200 118 420 190 L420 262 Q200 176 -20 262 Z"
      fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))"/>
    <g class="arena-crenellation-near">
      ${Array.from({ length: 12 }, (_, i) => `<rect x="${-4 + i * 36}" y="128" width="20" height="24" fill="color-mix(in srgb, var(--surface-border) 45%, var(--surface))"/>`).join("")}
    </g>

    <!-- Banner pennants atop the stands -->
    <g class="arena-banners">
      <line x1="76" y1="60" x2="76" y2="118" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="76,64 104,74 76,84" fill="var(--accent)"/>
      <line x1="200" y1="46" x2="200" y2="108" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="200,50 228,60 200,70" fill="var(--accent)"/>
      <line x1="324" y1="60" x2="324" y2="118" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="324,64 296,74 324,84" fill="var(--accent)"/>
    </g>

    <!-- Crowd dots, always cheering, seated on the two tiers -->
    <g class="crowd">
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${34 + i * 24}" cy="${150 - (i % 3) * 6}" r="5" fill="var(--accent)" opacity="0.5"/>`).join("")}
      ${Array.from({ length: 14 }, (_, i) => `<circle cx="${46 + i * 24}" cy="${224 - (i % 3) * 6}" r="5.5" fill="var(--accent)" opacity="0.5"/>`).join("")}
    </g>

    <!-- Sandy floor: a big ellipse filling the bottom half — the battlefield -->
    <ellipse cx="200" cy="600" rx="250" ry="200" fill="color-mix(in srgb, var(--gold) 18%, var(--ground))"
      stroke="var(--surface-border)" stroke-width="2.5"/>
    <!-- Inner sand shading ring for depth -->
    <ellipse cx="200" cy="600" rx="200" ry="158" fill="color-mix(in srgb, var(--gold) 10%, var(--ground))" opacity="0.6"/>

    <!-- Torches flanking the floor: flame/glow only at night -->
    <g class="arena-torch">
      <line x1="60" y1="470" x2="60" y2="560" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round"/>
      <circle class="arena-flame-glow" cx="60" cy="454" r="26" fill="var(--scene-detail)" opacity="0.25"/>
      <path class="arena-flame" d="M60 470 q-11 -14 0 -30 q11 16 0 30 z" fill="var(--scene-detail)"/>
    </g>
    <g class="arena-torch">
      <line x1="340" y1="470" x2="340" y2="560" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round"/>
      <circle class="arena-flame-glow" cx="340" cy="454" r="26" fill="var(--scene-detail)" opacity="0.25"/>
      <path class="arena-flame" d="M340 470 q-11 -14 0 -30 q11 16 0 30 z" fill="var(--scene-detail)"/>
    </g>
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
      <div class="enemy-name" id="enemy-name"></div>
      <div class="mission-slot" id="arena-mission"></div>
      <div class="arena-field">
        <div class="duck-row arena-team-row" id="arena-ducks"></div>
        <div class="enemy-group" id="enemy-group"></div>
      </div>
      <div class="hp-bar team"><span class="hp-fill" id="team-hp"></span><span class="hp-label" id="team-hp-label"></span></div>
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

  // Floaters resolve arena damage numbers over the struck enemy (first living
  // unit, matching game/arena.ts auto-target) rather than the attacking duck.
  setArenaEnemyTargetResolver(() => firstLivingEnemyArt());

  on("hit", (e) => {
    if (e.panel !== "arena") return;
    // Ducks auto-target the first living enemy (game/arena.ts). targetId is the
    // enemy TYPE id, shared by every unit in the group, so it can't pick a
    // specific unit — resolve the first non-dead .enemy-unit from the DOM.
    const targetUnit = firstLivingEnemyUnit();
    const duckEl = duckRowEl.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    if (duckEl && targetUnit) dashDuck(duckEl, e.duckId, targetUnit, e.isCrit);
    else if (targetUnit) {
      const art = targetUnit.querySelector<HTMLElement>(".enemy-art");
      if (art) retrigger(art, "flash");
    }
  });
  on("enemyhit", (e) => {
    retrigger(teamBarEl.parentElement as HTMLElement, e.isCrit ? "flash-crit" : "flash");
    // The attacking enemy isn't identified in the payload — lunge the first
    // living unit toward the duck team (left), concurrent with the bar flash.
    const enemyEl = firstLivingEnemyUnit();
    if (enemyEl) lungeEnemy(enemyEl);
  });
  on("wave", (e) => {
    if (e.boss) shakeArena();
  });

  // Gear swaps don't change rosterKey; rebuild the team row when a duck shown
  // in the arena has its equipment change (R5b).
  on("gear", (e) => {
    if (e.defId == null || state.rosters.arena.includes(e.defId)) renderRoster(state);
  });
}

function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const prefersReducedMotion =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// First non-dead enemy unit in the DOM (falls back to the first unit). Mirrors
// game/arena.ts's firstLivingEnemy auto-target so the visual strike lands on
// the same enemy the game just damaged.
function firstLivingEnemyUnit(): HTMLElement | null {
  return (
    enemiesEl.querySelector<HTMLElement>(".enemy-unit:not(.dead)") ??
    enemiesEl.querySelector<HTMLElement>(".enemy-unit")
  );
}
function firstLivingEnemyArt(): HTMLElement | null {
  const unit = firstLivingEnemyUnit();
  return unit?.querySelector<HTMLElement>(".enemy-art") ?? unit;
}

// Per-duck dash guard so overlapping hits don't restart the animation in
// flight (mirrors minePanel.ts's per-duck walking Set).
const dashing = new Set<string>();
const DASH_OUT_MS = 200;
const STRIKE_MS = 90;
const DASH_BACK_MS = 250;

// R4b: on an arena hit the attacking duck dashes ~70% of the way toward its
// target enemy, a brief strike flourish (arc/rotate), then returns. At the
// strike moment an impact burst spawns at the enemy and the enemy art flashes.
// Under reduced motion the dash is skipped; only the flash feedback remains.
function dashDuck(duckEl: HTMLElement, duckId: string, targetUnit: HTMLElement, isCrit: boolean): void {
  const art = targetUnit.querySelector<HTMLElement>(".enemy-art");

  const strike = (): void => {
    if (art) retrigger(art, "flash");
    const r = (art ?? targetUnit).getBoundingClientRect();
    spawnImpactBurst(r.left + r.width / 2, r.top + r.height / 2, isCrit ? 1.7 : 1);
  };

  if (prefersReducedMotion) {
    strike();
    return;
  }
  if (dashing.has(duckId)) return;

  const from = duckEl.getBoundingClientRect();
  const to = targetUnit.getBoundingClientRect();
  const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) * 0.7;
  const dy = (to.top + to.height / 2 - (from.top + from.height / 2)) * 0.7;

  dashing.add(duckId);
  duckEl.classList.add("arena-dashing");
  duckEl.style.setProperty("--dash-x", `${dx}px`);
  duckEl.style.setProperty("--dash-y", `${dy}px`);
  duckEl.style.setProperty("--dash-ms", `${DASH_OUT_MS}ms`);
  duckEl.style.setProperty("--dash-rot", "0deg");

  const strikeTimer = window.setTimeout(() => {
    // Strike frame: small arc/rotate flourish at the far point.
    duckEl.style.setProperty("--dash-rot", isCrit ? "-14deg" : "-8deg");
    strike();
  }, DASH_OUT_MS);

  const backTimer = window.setTimeout(() => {
    duckEl.style.setProperty("--dash-ms", `${DASH_BACK_MS}ms`);
    duckEl.style.setProperty("--dash-x", "0px");
    duckEl.style.setProperty("--dash-y", "0px");
    duckEl.style.setProperty("--dash-rot", "0deg");
  }, DASH_OUT_MS + STRIKE_MS);

  window.setTimeout(() => {
    duckEl.classList.remove("arena-dashing");
    duckEl.style.removeProperty("--dash-x");
    duckEl.style.removeProperty("--dash-y");
    duckEl.style.removeProperty("--dash-ms");
    duckEl.style.removeProperty("--dash-rot");
    dashing.delete(duckId);
    clearTimeout(strikeTimer);
    clearTimeout(backTimer);
  }, DASH_OUT_MS + STRIKE_MS + DASH_BACK_MS);
}

// R4b: brief forward lunge (toward the duck team on the left) + return.
function lungeEnemy(enemyEl: HTMLElement): void {
  if (prefersReducedMotion) return;
  retrigger(enemyEl, "enemy-lunge");
}

// R4b: boss-wave entrance screen-shake, reusing the streak-shake keyframe
// pattern on the arena body.
function shakeArena(): void {
  if (prefersReducedMotion) return;
  retrigger(panel, "arena-shake");
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

  // A brand-new group (different type/count than what was shown) walks in from
  // the right; a same-type refill (retry) just re-renders in place.
  const walkIn = !prefersReducedMotion && enemyKey(state) !== lastEnemyKey && lastEnemyKey !== "";

  enemiesEl.innerHTML = arena.enemies
    .map(
      (_, i) => `
      <div class="enemy-unit${walkIn ? " walk-in" : ""}" data-enemy="${i}" style="--depth:${i}">
        <div class="hp-bar enemy mini"><span class="hp-fill" data-enemy-hp="${i}"></span></div>
        <div class="enemy-art">${enemySvg(type.id, portraitSize, boss)}</div>
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
        `<div class="duck-slot fighter" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 64, { ascension, ringed: false, equipment: equippedItemsFor(state, defId) })}</div>`,
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
    if (unit) {
      const isDead = enemy.hp <= 0;
      // First frame this unit is dead: play the topple (rotate/translate/fade)
      // on top of the grey-out. `dead` stays applied so it reads as defeated.
      if (isDead && !unit.classList.contains("dead") && !prefersReducedMotion) {
        retrigger(unit, "toppling");
      }
      unit.classList.toggle("dead", isDead);
    }
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
