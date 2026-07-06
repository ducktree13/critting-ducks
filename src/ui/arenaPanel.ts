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

// Arena COLOSSEUM backdrop (Phase V4, PLAN2.md world redesign): a static SVG
// scene the player looks INTO — an enclosed elliptical amphitheater bowl in a
// gentle top-down-tilted perspective, not bleachers behind a backdrop. Built
// as concentric ellipse bands from the far arcade inward:
//   1. FAR ARCADE (upper third): stacked curved stone tiers following elliptical
//      arcs across the top, the top tier punched with repeating arch openings
//      (the signature colosseum silhouette) + crenellated rim + accent pennants.
//   2. CROWD dots seated along the tier curves (crowd-cheer animation kept).
//   3. BARRIER WALL: an ink-dark elliptical band — the inner rim of the bowl —
//      separating stands from sand, with a dark arched ENTRANCE GATE on the RIGHT
//      (where new-wave enemies walk in) and wall-mounted torches (night glow).
//   4. SAND FLOOR: the enclosed oval filling the middle/bottom (the battlefield
//      ground the ducks/enemies stand on), with rake lines + a centre emblem.
//   5. NEAR SIDE: low dark wall arcs cutting across the bottom corners — the
//      bowl continuing behind the camera — so the fight sits INSIDE the ring.
// No sky paint of its own (transparent above the bowl) so it sits over
// #world-backdrop. Container (.arena-scene) is TALL, so viewBox is TALL
// (400x780); all KEY content sits within x≈60..340 so the width `slice` only
// trims empty margins. Fills are all token-mixes for day/night legibility.
//
// The bowl is a stack of concentric ellipses sharing centre (cx=200) with a
// common vanishing point above, so each ring reads as the same oval seen in
// perspective. Outer→inner radii shrink and the vertical centre drops.
function colosseumSceneSvg(): string {
  // Arcade of arch windows along the top tier — THE colosseum motif. Each
  // arch is a taller ink-outlined opening; the stone piers between them are
  // implied by the gaps. Arches follow the tier's sag curve.
  const archCount = 8;
  const arches = Array.from({ length: archCount }, (_, i) => {
    const t = i / (archCount - 1); // 0..1 across the curve
    const cx = 76 + t * 248;
    const dip = Math.sin(t * Math.PI); // 0 at ends, 1 at centre — arcade sags down
    const cy = 92 + dip * 30;
    return (
      `<path d="M${cx - 13} ${cy + 30} L${cx - 13} ${cy} Q${cx} ${cy - 20} ${cx + 13} ${cy} L${cx + 13} ${cy + 30} Z"` +
      ` fill="color-mix(in srgb, var(--surface-border) 88%, #000)"` +
      ` stroke="var(--surface-border)" stroke-width="2.5"/>`
    );
  }).join("");

  // Crowd dots seated along a curve — MULTICOLORED so it reads as a crowd,
  // not amber noise. Cycles a small palette of token colors.
  const CROWD_FILLS = [
    "var(--accent)",
    "var(--xp)",
    "var(--hp)",
    "var(--rarity-rare)",
    "var(--rarity-epic)",
    "var(--scene-detail)",
  ];
  const crowdRow = (baseY: number, sag: number, r: number, n: number, x0: number, dx: number, phase: number) =>
    Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      const dip = Math.sin(t * Math.PI);
      const cx = x0 + i * dx;
      const cy = baseY + dip * sag - (i % 3) * 5;
      const fill = CROWD_FILLS[(i + phase) % CROWD_FILLS.length];
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.8" stroke="var(--surface-border)" stroke-width="1"/>`;
    }).join("");

  return `<svg viewBox="0 0 400 780" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <!-- ============ FAR ARCADE: stacked curved stone tiers ============ -->
    <!-- Outermost / highest tier (darkest, furthest back) -->
    <path class="arena-tier arena-tier-3" d="M-30 150 Q200 20 430 150 L430 176 Q200 52 -30 176 Z"
      fill="color-mix(in srgb, var(--surface-border) 55%, var(--surface))"
      stroke="var(--surface-border)" stroke-width="3"/>
    <!-- Crenellated rim on the top tier edge -->
    <g class="arena-rim">
      ${Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        const dip = Math.sin(t * Math.PI);
        const x = -2 + i * 34;
        const y = 40 + dip * 40;
        return `<rect x="${x}" y="${y}" width="16" height="16" rx="2" fill="color-mix(in srgb, var(--surface-border) 55%, var(--surface))" stroke="var(--surface-border)" stroke-width="2"/>`;
      }).join("")}
    </g>

    <!-- Middle tier -->
    <path class="arena-tier arena-tier-2" d="M-30 176 Q200 52 430 176 L430 210 Q200 82 -30 210 Z"
      fill="color-mix(in srgb, var(--surface-border) 42%, var(--surface))"
      stroke="var(--surface-border)" stroke-width="3"/>

    <!-- Top (nearest, brightest) tier — the arcade band the arches punch into -->
    <path class="arena-tier arena-tier-1" d="M-30 210 Q200 82 430 210 L430 250 Q200 118 -30 250 Z"
      fill="color-mix(in srgb, var(--surface-border) 30%, var(--surface))"
      stroke="var(--surface-border)" stroke-width="3"/>
    <!-- Repeating ARCH openings along the top tier — the colosseum signature -->
    <g class="arena-arches">${arches}</g>

    <!-- Accent pennants on poles along the rim -->
    <g class="arena-banners">
      <line x1="60" y1="70" x2="60" y2="112" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="60,74 86,82 60,90" fill="var(--accent)"/>
      <line x1="140" y1="46" x2="140" y2="92" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="140,50 166,58 140,66" fill="var(--accent)"/>
      <line x1="260" y1="46" x2="260" y2="92" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="260,50 234,58 260,66" fill="var(--accent)"/>
      <line x1="340" y1="70" x2="340" y2="112" stroke="var(--surface-border)" stroke-width="3"/>
      <polygon points="340,74 314,82 340,90" fill="var(--accent)"/>
    </g>

    <!-- ============ CROWD dots seated along the tier curves ============ -->
    <g class="crowd">
      ${crowdRow(140, 30, 4.5, 15, 40, 22, 0)}
      ${crowdRow(172, 32, 5, 15, 34, 24, 2)}
      ${crowdRow(206, 34, 5.5, 15, 30, 25, 4)}
    </g>

    <!-- ============ BARRIER WALL: ink-dark inner rim of the bowl ============ -->
    <!-- Outer edge of the wall band (top of the podium) -->
    <path class="arena-barrier" d="M-10 250 Q200 118 410 250 L410 300 Q200 176 -10 300 Z"
      fill="color-mix(in srgb, var(--surface-border) 92%, #000)"/>
    <!-- Highlight lip along the barrier top so it reads as a raised wall -->
    <path d="M-10 250 Q200 118 410 250" fill="none"
      stroke="color-mix(in srgb, var(--surface-border) 40%, var(--surface))" stroke-width="3"/>

    <!-- ENTRANCE GATE: dark arched opening on the RIGHT (new-wave enemies enter) -->
    <g class="arena-gate">
      <path d="M300 300 L300 250 Q322 232 344 250 L344 300 Z"
        fill="color-mix(in srgb, var(--surface-border) 96%, #000)"
        stroke="var(--surface-border)" stroke-width="2.5"/>
      <!-- Portcullis hint -->
      ${Array.from({ length: 4 }, (_, i) => `<line x1="${306 + i * 11}" y1="252" x2="${306 + i * 11}" y2="298" stroke="color-mix(in srgb, var(--surface-border) 55%, var(--surface))" stroke-width="1.5" opacity="0.6"/>`).join("")}
      <line x1="300" y1="270" x2="344" y2="270" stroke="color-mix(in srgb, var(--surface-border) 55%, var(--surface))" stroke-width="1.5" opacity="0.6"/>
    </g>

    <!-- ============ SAND FLOOR: the enclosed battlefield oval ============ -->
    <!-- Wide enough that the whole .arena-field ground band sits ON the sand,
         inside the barrier ring (rx spans past the safe column on purpose). -->
    <!-- SAND, not grass: warm tan mixed from gold + cream surface. The old
         gold+GROUND mix was 80% green — the "green circle" complaint. -->
    <ellipse class="arena-sand" cx="200" cy="575" rx="272" ry="240"
      fill="color-mix(in srgb, var(--gold) 32%, var(--surface))"/>
    <!-- Ink edge where the sand meets the barrier wall -->
    <ellipse cx="200" cy="575" rx="272" ry="240" fill="none"
      stroke="var(--surface-border)" stroke-width="4" opacity="0.9"/>
    <!-- Inner shading ring for bowl depth (slightly deeper tan) -->
    <ellipse cx="200" cy="576" rx="196" ry="182" fill="color-mix(in srgb, var(--gold) 40%, var(--surface))" opacity="0.45"/>
    <!-- Centre emblem + faint rake lines for sand texture -->
    <ellipse cx="200" cy="600" rx="48" ry="26" fill="none"
      stroke="color-mix(in srgb, var(--surface-border) 55%, var(--gold))" stroke-width="2" opacity="0.5"/>
    <g class="arena-rake" opacity="0.3">
      ${Array.from({ length: 5 }, (_, i) => {
        const ry = 120 + i * 30;
        return `<ellipse cx="200" cy="600" rx="${ry + 40}" ry="${ry}" fill="none" stroke="color-mix(in srgb, var(--surface-border) 45%, var(--gold))" stroke-width="1.5"/>`;
      }).join("")}
    </g>

    <!-- Wall-mounted TORCHES on the barrier (night-only flame/glow) -->
    <g class="arena-torch">
      <line x1="66" y1="286" x2="66" y2="330" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round"/>
      <circle class="arena-flame-glow" cx="66" cy="270" r="26" fill="var(--scene-detail)" opacity="0.25"/>
      <path class="arena-flame" d="M66 286 q-11 -14 0 -30 q11 16 0 30 z" fill="var(--scene-detail)"/>
    </g>
    <g class="arena-torch">
      <line x1="334" y1="286" x2="334" y2="330" stroke="var(--surface-border)" stroke-width="6" stroke-linecap="round"/>
      <circle class="arena-flame-glow" cx="334" cy="270" r="26" fill="var(--scene-detail)" opacity="0.25"/>
      <path class="arena-flame" d="M334 286 q-11 -14 0 -30 q11 16 0 30 z" fill="var(--scene-detail)"/>
    </g>

    <!-- ============ NEAR SIDE: bowl continues behind the camera ============ -->
    <!-- Low dark wall arcs cutting across the bottom corners (foreground frame) -->
    <path class="arena-near-wall" d="M-40 780 L-40 700 Q90 792 140 800 L-40 800 Z"
      fill="color-mix(in srgb, var(--surface-border) 90%, #000)"
      stroke="var(--surface-border)" stroke-width="3"/>
    <path class="arena-near-wall" d="M440 780 L440 700 Q310 792 260 800 L440 800 Z"
      fill="color-mix(in srgb, var(--surface-border) 90%, #000)"
      stroke="var(--surface-border)" stroke-width="3"/>
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
