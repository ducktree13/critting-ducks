// Procedural tree generator (presentation only — game/ must never import this).
// Per design/STYLE.md §6: trees are *generated, not drawn*. One recursive
// branch() with a seeded PRNG (mulberry32, reused from game/rng) produces the
// same tree for the same seed every load. The tree grows in recursion depth
// with the player's owned-node count; nodes are seated onto computed anchors
// along the branches. Rendering is flat two-tone (merged ink silhouette +
// bark fills + core-shadow ribbon + individual ink-outlined leaves).

import { mulberry32 } from "../game/rng";
import type { TreeId } from "../game/types";

// ---- Species parameters -------------------------------------------------

export interface SpeciesParams {
  trunkLen: number;
  trunkW: number;
  spread: number; // half-angle fan across children (radians)
  wiggle: number; // per-step angle jitter
  pull: number; // upward pull toward vertical
  pullVar: number; // per-branch pull variance
  kids: number[]; // children per depth
  lenK: number; // child length multiplier
  primK: number; // primary (first) child length bonus
  midProb: number; // mid-branch fork probability (gnarl)
  maxDepth: number;
  rootFlare: number; // number of tapered root-flare limbs (0 = none)
}

// Base "gnarled oak" (Woodland) — the numbers from §6.
const OAK: SpeciesParams = {
  trunkLen: 44,
  trunkW: 21,
  spread: 1.2,
  wiggle: 0.6,
  pull: 0.04,
  pullVar: 0.12,
  kids: [4, 3, 2, 2],
  lenK: 0.75,
  primK: 1.1,
  midProb: 0.35,
  maxDepth: 4,
  rootFlare: 4,
};

// Act-2 trees are smaller (14 nodes each): trim kids so ~14–18 anchors emerge.
const OAK_SAPLING: SpeciesParams = {
  ...OAK,
  trunkW: 16,
  kids: [3, 3, 2, 2],
  maxDepth: 4,
};

// ---- Geometry model -----------------------------------------------------

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  wBase: number; // polygon width at base
  wTip: number; // polygon width at tip
  depth: number; // recursion depth (0 = trunk)
  major: boolean; // trunk or primary limb — gets a core-shadow ribbon
  parentTipX: number; // joint the segment scales out of (for growth anim)
  parentTipY: number;
}

export interface Anchor {
  x: number;
  y: number;
  depth: number;
  dist: number; // path distance from root
}

export interface GeneratedTree {
  segments: Segment[];
  anchors: Anchor[]; // ALL raw anchors, sorted by distance-from-root (unthinned)
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rootX: number;
  rootY: number;
}

const UP = -Math.PI / 2; // screen-space "up" (negative y)

// Width eases base->tip by ×0.58 along a limb; children inherit parent tip.
const TIP_K = 0.58;
const CHILD_W_K = 0.82; // 0.78–0.86 band, mid value

// Walk one limb over 4 steps, emitting a segment per step. Returns the tip.
function walk(
  segs: Segment[],
  anchors: Anchor[],
  rng: () => number,
  p: SpeciesParams,
  startX: number,
  startY: number,
  startDist: number,
  angle: number,
  len: number,
  width: number,
  depth: number,
  maxDepth: number,
  major: boolean,
  branchPull: number,
): { x: number; y: number; angle: number; tipW: number; dist: number } {
  const STEPS = 4;
  const stepLen = len / STEPS;
  let x = startX;
  let y = startY;
  let dist = startDist;
  let a = angle;
  const parentX = startX;
  const parentY = startY;
  // Fixed anchor fractions along the limb; trunk (depth 0) carries only 2.
  const anchorFracs = depth === 0 ? [0.55, 0.9] : [0.4, 0.78];

  for (let s = 0; s < STEPS; s++) {
    a += (rng() - 0.5) * p.wiggle;
    a += (UP - a) * branchPull;
    const nx = x + Math.cos(a) * stepLen;
    const ny = y + Math.sin(a) * stepLen;
    const f0 = s / STEPS;
    const f1 = (s + 1) / STEPS;
    const wB = width * (1 - f0 * (1 - TIP_K));
    const wT = width * (1 - f1 * (1 - TIP_K));
    segs.push({
      x1: x,
      y1: y,
      x2: nx,
      y2: ny,
      wBase: wB,
      wTip: wT,
      depth,
      major,
      parentTipX: parentX,
      parentTipY: parentY,
    });
    x = nx;
    y = ny;
    dist += stepLen;
    // seat anchor candidates at the fixed fractions crossing this step
    for (const fr of anchorFracs) {
      if (fr > f0 && fr <= f1) {
        anchors.push({ x, y, depth, dist });
      }
    }
  }

  const tipW = width * TIP_K;

  if (depth < maxDepth) {
    const n = p.kids[depth] ?? 2;
    for (let k = 0; k < n; k++) {
      // fan children across ±spread; first child is the primary (longer).
      const t = n === 1 ? 0 : k / (n - 1) - 0.5;
      const childAngle = a + t * p.spread + (rng() - 0.5) * 0.25;
      const primary = k === 0;
      const childLen = len * p.lenK * (primary ? p.primK : 1);
      const childW = tipW * CHILD_W_K;
      const childPull = p.pull + (rng() - 0.5) * 2 * p.pullVar;
      walk(
        segs,
        anchors,
        rng,
        p,
        x,
        y,
        dist,
        childAngle,
        childLen,
        childW,
        depth + 1,
        maxDepth,
        primary && depth === 0,
        childPull,
      );
    }
    // mid-branch forks add gnarl
    if (depth < maxDepth - 1 && rng() < p.midProb) {
      const forkAngle = a + (rng() < 0.5 ? -1 : 1) * (p.spread * 0.7);
      walk(
        segs,
        anchors,
        rng,
        p,
        x,
        y,
        dist,
        forkAngle,
        len * p.lenK * 0.8,
        tipW * CHILD_W_K,
        depth + 1,
        maxDepth,
        false,
        p.pull + (rng() - 0.5) * 2 * p.pullVar,
      );
    }
  }

  return { x, y, angle: a, tipW, dist };
}

// Greedy min-separation thinning: keep anchors (in root-distance order) that
// are >= `minSep` (tree-space units) from all previously-kept anchors. The
// caller supplies `minSep` computed from the final render fit so on-screen
// separation is what actually gets enforced. If the greedy pass at `minSep`
// can't reach `cap` candidates, relax stepwise down to `floorSep` — never
// below that — so nodes stay visibly apart.
export function thinAnchors(sorted: Anchor[], cap: number, minSep: number, floorSep: number): Anchor[] {
  let best: Anchor[] = [];
  const step = Math.max(1, (minSep - floorSep) / 6);
  for (let sep = minSep; sep >= floorSep - 1e-6; sep -= step) {
    const kept: Anchor[] = [];
    for (const a of sorted) {
      let ok = true;
      for (const b of kept) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < sep * sep) {
          ok = false;
          break;
        }
      }
      if (ok) kept.push(a);
    }
    if (kept.length > best.length) best = kept;
    if (kept.length >= cap) return kept.slice(0, cap);
  }
  return best.slice(0, cap);
}

// A small stable string hash -> uint32, used to fold the tree id into the seed.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

// Curated master seeds — one hand-picked constant per tree, so the same tree
// renders every load (§6 "curated seeds"). Picked by eyeballing the preview:
// each yields a balanced, readable crown with enough anchors.
const MASTER_SEED = 0x1a2b3c;
const TREE_SEED_SALT: Record<TreeId, number> = {
  act1: 7,
  mining2: 21,
  combat2: 3,
  crit2: 12,
  passive2: 29,
};

function speciesFor(treeId: TreeId): SpeciesParams {
  return treeId === "act1" ? OAK : OAK_SAPLING;
}

// Generate the full tree (always full recursion depth) seeded deterministically
// from the tree id. Returns ALL raw anchors sorted inner->outer; the caller
// thins them (via thinAnchors) against the final render fit so on-screen node
// spacing is enforced. The skeleton is constant across the whole run — the
// visible progression is owned-gated foliage, not tree growth.
export function generateTree(treeId: TreeId): GeneratedTree {
  const p = speciesFor(treeId);
  const maxDepth = p.maxDepth;
  const seed = (MASTER_SEED ^ hashStr(treeId) ^ (TREE_SEED_SALT[treeId] * 0x9e3779b1)) >>> 0;
  const prng = mulberry32(seed);
  const rng = () => prng.next();

  const segs: Segment[] = [];
  const rawAnchors: Anchor[] = [];
  const rootX = 0;
  const rootY = 0;

  // Root-flare limbs first (short, splayed, at the base) — decorative only.
  if (p.rootFlare > 0 && maxDepth >= 1) {
    for (let i = 0; i < p.rootFlare; i++) {
      const t = p.rootFlare === 1 ? 0 : i / (p.rootFlare - 1) - 0.5;
      const ra = UP + t * 2.6; // splay wide
      const flareSegs: Segment[] = [];
      walk(flareSegs, [], rng, p, rootX, rootY, 0, ra, p.trunkLen * 0.32, p.trunkW * 0.7, 3, 3, false, 0.02);
      segs.push(...flareSegs);
    }
  }

  // The trunk + crown.
  walk(segs, rawAnchors, rng, p, rootX, rootY, 0, UP, p.trunkLen, p.trunkW, 0, maxDepth, true, p.pull);

  // Sort anchors inner->outer (thinning is deferred to the caller, which knows
  // the final render fit and thus the on-screen min separation to enforce).
  rawAnchors.sort((a, b) => a.dist - b.dist);
  const anchors = rawAnchors;

  // Bounds over all segment endpoints (for auto-fit).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of segs) {
    for (const [px, py, w] of [
      [s.x1, s.y1, s.wBase],
      [s.x2, s.y2, s.wTip],
    ] as const) {
      minX = Math.min(minX, px - w);
      maxX = Math.max(maxX, px + w);
      minY = Math.min(minY, py - w);
      maxY = Math.max(maxY, py + w);
    }
  }

  return { segments: segs, anchors, bounds: { minX, minY, maxX, maxY }, rootX, rootY };
}
