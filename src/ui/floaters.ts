import { on } from "../game/events";
import { fmt } from "./format";

// Design contract: design/STYLE.md §7 + §8. Fixed pools, round-robin reuse,
// transform/opacity-only per-frame animation. No per-hit createElement/remove.

const FLOATER_POOL_SIZE = 12;
const PARTICLE_POOL_SIZE = 18; // ~3 bursts' worth of 6-particle crit wedges

const NORMAL_LIFE_MS = 480;
const CRIT_LIFE_MS = 640;
const BURST_LIFE_MS = 300;
const PARTICLES_PER_BURST = 6;

const reducedMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let floaterPool: HTMLElement[] = [];
let floaterCursor = 0;
let particlePool: HTMLElement[] = [];
let particleCursor = 0;

// Extension point (R4b): the arena panel resolves which enemy element a hit
// landed on (first living .enemy-unit, matching game/arena.ts's auto-target).
// When set, arena-panel floaters/bursts anchor over the struck enemy instead
// of over the attacking duck. Returns the target element or null.
let arenaEnemyTargetResolver: (() => HTMLElement | null) | null = null;
export function setArenaEnemyTargetResolver(fn: () => HTMLElement | null): void {
  arenaEnemyTargetResolver = fn;
}

function makeFloaterEl(anchors: { mine: HTMLElement; arena: HTMLElement }): HTMLElement {
  const el = document.createElement("div");
  el.className = "floater";
  el.style.display = "none";
  // Parked on the mine anchor by default; reparented on use.
  anchors.mine.appendChild(el);
  return el;
}

function makeParticleEl(): HTMLElement {
  const el = document.createElement("div");
  el.className = "crit-particle";
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

// Spawns floating "+N" numbers over the depositing/attacking duck (PLAN2.md
// §12) using a fixed pool of reusable nodes, round-robin (§7/§8: no per-hit
// DOM churn). Falls back to a jittered position over the panel if the duck's
// slot isn't found (e.g. mid-reroster).
export function initFloaters(anchors: { mine: HTMLElement; arena: HTMLElement }): void {
  floaterPool = Array.from({ length: FLOATER_POOL_SIZE }, () => makeFloaterEl(anchors));
  particlePool = Array.from({ length: PARTICLE_POOL_SIZE }, () => makeParticleEl());

  on("hit", (e) => {
    const anchor = anchors[e.panel];
    if (!anchor) return;

    const el = floaterPool[floaterCursor];
    floaterCursor = (floaterCursor + 1) % floaterPool.length;

    if (el.parentElement !== anchor) anchor.appendChild(el);

    el.className = e.isCrit ? "floater crit" : "floater";
    const amount = e.panel === "arena" ? e.dmg : e.gold;
    el.textContent = `+${fmt(amount)}${e.isCrit ? "!" : ""}`;

    // Arena damage numbers anchor over the STRUCK ENEMY (first living unit)
    // rather than the attacking duck; mine keeps anchoring over the duck.
    const targetEl =
      e.panel === "arena" && arenaEnemyTargetResolver
        ? arenaEnemyTargetResolver()
        : null;
    const originEl = targetEl ?? anchor.querySelector<HTMLElement>(`[data-duck="${e.duckId}"]`);
    let originX: number;
    let originY: number;
    if (originEl) {
      // getBoundingClientRect (not offsetLeft/Top) so this doesn't care which
      // ancestor establishes the positioning context for `anchor`.
      const duckRect = originEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      el.style.top = "auto";
      el.style.left = `${duckRect.left - anchorRect.left + duckRect.width / 2}px`;
      el.style.bottom = `${anchorRect.bottom - duckRect.top}px`;
      originX = duckRect.left + duckRect.width / 2;
      originY = duckRect.top;
    } else {
      const jitter = (Math.random() - 0.5) * 80;
      el.style.left = `calc(50% + ${jitter}px)`;
      el.style.top = "auto";
      el.style.bottom = "40%";
      const anchorRect = anchor.getBoundingClientRect();
      originX = anchorRect.left + anchorRect.width / 2 + jitter;
      originY = anchorRect.top + anchorRect.height * 0.6;
    }

    el.style.display = "";
    // Restart the CSS animation deterministically.
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    el.classList.add("anim");

    const life = e.isCrit ? CRIT_LIFE_MS : NORMAL_LIFE_MS;
    window.setTimeout(() => {
      el.classList.remove("anim");
      el.style.display = "none";
    }, life);

    if (e.isCrit && !reducedMotion) spawnCritBurst(originX, originY);
  });
}

// Impact burst at a screen-space point, reusing the pooled crit-particle nodes
// (R4b: arena panel spawns one at the enemy on each strike, bigger on crit).
// `scale` widens the spread for crit hits. No-op under reduced motion.
export function spawnImpactBurst(x: number, y: number, scale = 1): void {
  if (reducedMotion) return;
  spawnCritBurst(x, y, scale);
}

function spawnCritBurst(x: number, y: number, scale = 1): void {
  for (let i = 0; i < PARTICLES_PER_BURST; i++) {
    const el = particlePool[particleCursor];
    particleCursor = (particleCursor + 1) % particlePool.length;

    const angle = (Math.PI * 2 * i) / PARTICLES_PER_BURST + (Math.random() - 0.5) * 0.3;
    const dist = (26 + Math.random() * 14) * scale;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${dx}px`);
    el.style.setProperty("--dy", `${dy}px`);

    el.style.display = "";
    el.classList.remove("anim");
    void el.offsetWidth;
    el.classList.add("anim");

    window.setTimeout(() => {
      el.classList.remove("anim");
      el.style.display = "none";
    }, BURST_LIFE_MS);
  }
}
