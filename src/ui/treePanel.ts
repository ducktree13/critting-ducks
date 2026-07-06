import { ACT2_TREE_IDS } from "../game/chapters";
import { on } from "../game/events";
import { buy, canBuy, getSkillNode, isOwned, isVisible, nodesForTree, SKILL_NODES } from "../game/skilltree";
import type { GameState, NodeEffect, SkillNode, TreeId } from "../game/types";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { attachTooltip } from "./tooltip";
import {
  generateTree,
  thinAnchors,
  type Anchor,
  type GeneratedTree,
  type Segment,
} from "./treegen";

const TREE_NAMES: Record<TreeId, string> = {
  act1: "Skill Tree",
  mining2: "Mining Grove",
  combat2: "Battle Thicket",
  crit2: "Crit Bramble",
  passive2: "Fortune Willow",
};

let panel: HTMLElement;
let tickerEl: HTMLElement;
let missionEl: HTMLElement;
let bodyEl: HTMLElement;
let gameState: GameState;
let freshNodeId: string | null = null; // most recently bought — its leaves pop
let lastLayoutKey = "";

// Cache for the per-frame affordability pass: the queried node list (only
// re-queried when the layout is rebuilt) and the last cache key it was
// evaluated against (gold floor + level + owned count — the only inputs that
// can flip canBuy's result for a given node set).
let cachedAffordableNodes: SVGGElement[] | null = null;
let lastAffordableKey = "";

// ---- Node type -> icon + color (§6). Icons are tiny SVG paths drawn in a
// local ~[-6,6] box, translated to the anchor. Color is a CSS var per type. --
interface NodeType {
  color: string; // CSS var used for owned fill / affordable ring
  ink: string; // icon stroke/fill color that reads on the type color
  icon: string; // <path>/<polygon> markup centered on 0,0
}

function nodeType(effect: NodeEffect): NodeType {
  const gold: NodeType = { color: "var(--gold)", ink: "var(--surface-border)", icon: ICON_PICK };
  const attack: NodeType = { color: "var(--accent)", ink: "var(--accent-ink)", icon: ICON_SWORD };
  const defense: NodeType = { color: "var(--xp)", ink: "var(--surface-border)", icon: ICON_SHIELD };
  const crit: NodeType = { color: "var(--crit)", ink: "var(--crit-ink)", icon: ICON_SPARK };
  const passive: NodeType = { color: "var(--rarity-uncommon)", ink: "var(--surface-border)", icon: ICON_LEAF };
  switch (effect.kind) {
    case "slot":
      return effect.panel === "mine" ? gold : effect.panel === "arena" ? attack : passive;
    case "oreUnlock":
      return gold;
    case "offline":
      return passive;
    case "buffDuration":
      return crit;
    case "packCrit":
      return crit;
    case "stat":
      switch (effect.stat) {
        case "critChance":
        case "critMult":
          return crit;
        case "orePerHit":
        case "oreMult":
        case "goldMult":
          return gold;
        case "flatAttack":
        case "attackDamageMult":
        case "attackSpeedMult":
        case "arenaSpeedMult":
        case "mineSpeedMult":
          return attack;
        case "flatDefense":
        case "defenseMult":
          return defense;
        case "xpMult":
          return passive;
        default:
          return passive;
      }
  }
}

// Icon glyphs — flat, ink-outlinable, centered on the origin (~11px tall).
const ICON_PICK = `<path d="M -5 5 L 5 -5 M 5 -5 C 2 -6 -1 -6 -4 -4 M 5 -5 C 6 -2 6 1 4 4" fill="none" stroke-width="1.6"/>`;
const ICON_SWORD = `<path d="M 0 -6 L 2 -1 L 2 3 L -2 3 L -2 -1 Z M -3 3 L 3 3 M 0 3 L 0 6" fill="none" stroke-width="1.5"/>`;
const ICON_SHIELD = `<path d="M 0 -6 L 5 -4 L 5 1 C 5 4 3 5 0 6 C -3 5 -5 4 -5 1 L -5 -4 Z" fill="none" stroke-width="1.5"/>`;
const ICON_SPARK = `<path d="M 0 -6 L 1.4 -1.4 L 6 0 L 1.4 1.4 L 0 6 L -1.4 1.4 L -6 0 L -1.4 -1.4 Z" stroke="none"/>`;
const ICON_LEAF = `<path d="M 0 -6 C 4 -3 4 3 0 6 C -4 3 -4 -3 0 -6 Z M 0 -5 L 0 5" fill="none" stroke-width="1.5"/>`;

// Per-tree geometry + node seating, cached (the tree only rebuilds on
// buy/chapter events, not per frame). Regenerated whenever the growth stage
// or owned set changes so seating stays stable within a stage.
interface Seated {
  tree: GeneratedTree;
  pos: Map<string, Anchor>; // nodeId -> seated anchor (fitted coords)
  fit: { s: number; tx: number; ty: number }; // transform to fit 400x600
}

const GROUND_Y = 572;
const FIT_W = 360; // usable width inside the 400 viewBox (widened in R2 so the
// 30 act-1 nodes spread far enough apart to seat without overlap)
const FIT_TOP = 40; // top margin

// The skeleton renders at a constant tall scale (a hair under a perfect fit) so
// the tree is a full barren silhouette from the first frame; foliage — not tree
// size — is the visible progression.
const TREE_SCALE = 0.95;
// Target node separation in viewBox space between any two seated nodes. Nodes
// render at r=13 (26px diameter), so ~32 units keeps a clear gap. Act-1's
// 30-node tree (the tightest) tops out around 33 units with FIT_W=360; we aim
// at 32 and relax toward the 26px floor (== node diameter, no overlap) only if
// a tree can't reach it.
const TARGET_SEP_PX = 32;
const TARGET_SEP_FLOOR_PX = 26;

// Chain depth: number of requires-hops back to a root, for topo seating order.
function chainDepth(node: SkillNode): number {
  let d = 0;
  let cur: SkillNode | undefined = node;
  while (cur?.requires) {
    cur = getSkillNode(cur.requires);
    d++;
  }
  return d;
}

// Fit the generated tree (root at 0,0, grows up = -y) into the 400x600 canvas
// with the base pinned to the ground line.
function fitTransform(tree: GeneratedTree): { s: number; tx: number; ty: number } {
  const b = tree.bounds;
  const w = b.maxX - b.minX || 1;
  const h = b.maxY - b.minY || 1;
  const s = Math.min(FIT_W / w, (GROUND_Y - FIT_TOP) / h);
  // center horizontally on x=200; pin root (0,0) to the ground line.
  const tx = 200 - ((b.minX + b.maxX) / 2) * s;
  const ty = GROUND_Y; // root y=0 maps here; up (-y) rises above the ground
  return { s, tx, ty };
}

function apply(fit: { s: number; tx: number; ty: number }, x: number, y: number): { x: number; y: number } {
  return { x: fit.tx + x * fit.s, y: fit.ty + y * fit.s };
}

function seatTree(treeId: TreeId): Seated {
  const nodes = nodesForTree(treeId);
  const cap = treeId === "act1" ? 30 : 16;
  const tree = generateTree(treeId);
  const fit = fitTransform(tree);
  // Constant tall render scale — no stage growth. The skeleton is the same size
  // from S0; foliage accumulation is the visible progression.
  fit.s *= TREE_SCALE;
  fit.tx = 200 - ((tree.bounds.minX + tree.bounds.maxX) / 2) * fit.s;

  // Thin the raw anchors in FINAL rendered space: convert the target on-screen
  // separation back into tree-space units through the fit so seated nodes end
  // up >= TARGET_SEP_PX apart in the viewBox. Relax toward the floor only if the
  // set can't seat all `cap` nodes at the target.
  const minSep = TARGET_SEP_PX / fit.s;
  const floorSep = TARGET_SEP_FLOOR_PX / fit.s;
  const seatable = thinAnchors(tree.anchors, cap, minSep, floorSep);

  // Order nodes topologically (chain depth, then cost) and anchors by
  // root-distance; zip them so parents always sit closer to the root.
  const ordered = [...nodes].sort((a, b) => {
    const da = chainDepth(a);
    const db = chainDepth(b);
    return da !== db ? da - db : a.cost - b.cost;
  });
  const anchors = seatable.sort((a, b) => a.dist - b.dist);

  const pos = new Map<string, Anchor>();
  for (let i = 0; i < ordered.length; i++) {
    const anchor = anchors[Math.min(i, anchors.length - 1)];
    const p = apply(fit, anchor.x, anchor.y);
    pos.set(ordered[i].id, { x: p.x, y: p.y, depth: anchor.depth, dist: anchor.dist });
  }
  return { tree, pos, fit };
}

// Merged-ink silhouette + bark polygon for one segment (tapered).
function segPolygon(fit: { s: number; tx: number; ty: number }, seg: Segment, expand: number): string {
  const a = apply(fit, seg.x1, seg.y1);
  const b = apply(fit, seg.x2, seg.y2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular unit
  const nx = -dy / len;
  const ny = dx / len;
  const wb = (seg.wBase * fit.s) / 2 + expand;
  const wt = (seg.wTip * fit.s) / 2 + expand;
  const p1 = `${(a.x + nx * wb).toFixed(1)} ${(a.y + ny * wb).toFixed(1)}`;
  const p2 = `${(b.x + nx * wt).toFixed(1)} ${(b.y + ny * wt).toFixed(1)}`;
  const p3 = `${(b.x - nx * wt).toFixed(1)} ${(b.y - ny * wt).toFixed(1)}`;
  const p4 = `${(a.x - nx * wb).toFixed(1)} ${(a.y - ny * wb).toFixed(1)}`;
  return `${p1} ${p2} ${p3} ${p4}`;
}

// Core-shadow ribbon: a thin (30% width) strip offset to the shade side.
function segRibbon(fit: { s: number; tx: number; ty: number }, seg: Segment): string {
  const a = apply(fit, seg.x1, seg.y1);
  const b = apply(fit, seg.x2, seg.y2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const wb = (seg.wBase * fit.s) / 2;
  const wt = (seg.wTip * fit.s) / 2;
  const off = 0.35; // shade side offset fraction
  // ribbon spans from ~+0.05w to +0.35w on one consistent side.
  const o1 = wb * off;
  const o2 = wt * off;
  const r1 = wb * 0.05;
  const r2 = wt * 0.05;
  const p1 = `${(a.x + nx * o1).toFixed(1)} ${(a.y + ny * o1).toFixed(1)}`;
  const p2 = `${(b.x + nx * o2).toFixed(1)} ${(b.y + ny * o2).toFixed(1)}`;
  const p3 = `${(b.x + nx * r2).toFixed(1)} ${(b.y + ny * r2).toFixed(1)}`;
  const p4 = `${(a.x + nx * r1).toFixed(1)} ${(a.y + ny * r1).toFixed(1)}`;
  return `${p1} ${p2} ${p3} ${p4}`;
}

// Lit rim: mirror of the core-shadow ribbon on the opposite (lit, upper-left)
// side of a limb. The shadow ribbon sits on the +normal side; the rim sits on
// the -normal side so the two together round the limb under an upper-left light.
function segRibbonLit(fit: { s: number; tx: number; ty: number }, seg: Segment): string {
  const a = apply(fit, seg.x1, seg.y1);
  const b = apply(fit, seg.x2, seg.y2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const wb = (seg.wBase * fit.s) / 2;
  const wt = (seg.wTip * fit.s) / 2;
  const off = 0.32; // lit side offset fraction (slightly tighter than shadow)
  const o1 = wb * off;
  const o2 = wt * off;
  const r1 = wb * 0.05;
  const r2 = wt * 0.05;
  // negate the normal to sit on the lit side.
  const p1 = `${(a.x - nx * o1).toFixed(1)} ${(a.y - ny * o1).toFixed(1)}`;
  const p2 = `${(b.x - nx * o2).toFixed(1)} ${(b.y - ny * o2).toFixed(1)}`;
  const p3 = `${(b.x - nx * r2).toFixed(1)} ${(b.y - ny * r2).toFixed(1)}`;
  const p4 = `${(a.x - nx * r1).toFixed(1)} ${(a.y - ny * r1).toFixed(1)}`;
  return `${p1} ${p2} ${p3} ${p4}`;
}

// A small deterministic PRNG seeded from a segment's index + coords, using the
// same FNV-1a + xorshift trick as leafFan so a given segment always textures
// the same way.
function segRng(seed: number): () => number {
  let h = 2166136261 ^ (seed >>> 0);
  return () => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h >>> 8) & 0xffff) / 0x10000;
  };
}

// Bark texture: 2-3 short longitudinal strokes running along a segment,
// jittered off the centerline. Deterministic per segment index.
function barkStrokes(fit: { s: number; tx: number; ty: number }, seg: Segment, idx: number): string {
  const a = apply(fit, seg.x1, seg.y1);
  const b = apply(fit, seg.x2, seg.y2);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const wb = (seg.wBase * fit.s) / 2;
  const rnd = segRng(idx * 2654435761 + Math.round(a.x) * 40503);
  const count = 2 + Math.floor(rnd() * 2); // 2-3
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // offset across the limb width (avoid the very edges)
    const off = (rnd() - 0.5) * 1.4 * wb * 0.7;
    // stroke spans a jittered sub-run along the limb
    const f0 = 0.1 + rnd() * 0.25;
    const f1 = f0 + 0.35 + rnd() * 0.3;
    const sx = a.x + dx * f0 + nx * off;
    const sy = a.y + dy * f0 + ny * off;
    const ex = a.x + dx * Math.min(f1, 0.95) + nx * off * 0.7;
    const ey = a.y + dy * Math.min(f1, 0.95) + ny * off * 0.7;
    out.push(
      `<path class="tree-bark-tex" d="M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}"/>`,
    );
  }
  return out.join("");
}

// A leaf = two quadratic curves meeting at a point + center vein.
function leafPath(cx: number, cy: number, rot: number, size: number): string {
  const r = (a: number) => (a * Math.PI) / 180;
  const co = Math.cos(r(rot));
  const si = Math.sin(r(rot));
  const T = (lx: number, ly: number) => `${(cx + lx * co - ly * si).toFixed(1)} ${(cy + lx * si + ly * co).toFixed(1)}`;
  const tipX = 0;
  const tipY = -size;
  const baseX = 0;
  const baseY = size * 0.5;
  const bw = size * 0.55;
  return (
    `M ${T(baseX, baseY)} Q ${T(-bw, 0)} ${T(tipX, tipY)} ` +
    `Q ${T(bw, 0)} ${T(baseX, baseY)} Z`
  );
}

// Deterministic per-id leaf fan (4–7 leaves) around an owned anchor.
function leafFan(id: string, cx: number, cy: number, fresh: boolean): string {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    return ((h >>> 8) & 0xffff) / 0x10000;
  };
  const count = 4 + Math.floor(rnd() * 4); // 4–7
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const ang = -90 + (i / (count - 1) - 0.5) * 150 + (rnd() - 0.5) * 20;
    const rad = 9 + rnd() * 6;
    const lx = cx + Math.cos((ang * Math.PI) / 180) * rad;
    const ly = cy + Math.sin((ang * Math.PI) / 180) * rad;
    const size = 7 + rnd() * 3;
    const cls = `leaf leaf-${i % 2 === 0 ? "a" : "b"}${fresh ? " pop" : ""}`;
    out.push(
      `<path class="${cls}" d="${leafPath(lx, ly, ang + 90, size)}" style="animation-delay:${i * 55}ms"/>`,
    );
  }
  return out.join("");
}

// Cluster owned outer anchor points into 2-4 proximity groups (simple greedy:
// each point joins the nearest existing group centroid within a radius, else
// starts a new group; cap at maxGroups by merging the smallest overflow into
// the nearest). Returns group centroids + a rough radius spanning the members.
interface CrownGroup {
  cx: number;
  cy: number;
  r: number;
  n: number;
}
function clusterPoints(pts: { x: number; y: number }[], maxGroups: number): CrownGroup[] {
  if (pts.length === 0) return [];
  const groups: { xs: number[]; ys: number[] }[] = [];
  const joinR = 42; // px in fitted space
  for (const p of pts) {
    let best = -1;
    let bestD = Infinity;
    for (let g = 0; g < groups.length; g++) {
      const cx = groups[g].xs.reduce((s, v) => s + v, 0) / groups[g].xs.length;
      const cy = groups[g].ys.reduce((s, v) => s + v, 0) / groups[g].ys.length;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestD) {
        bestD = d;
        best = g;
      }
    }
    if (best >= 0 && (bestD < joinR || groups.length >= maxGroups)) {
      groups[best].xs.push(p.x);
      groups[best].ys.push(p.y);
    } else {
      groups.push({ xs: [p.x], ys: [p.y] });
    }
  }
  return groups.map((g) => {
    const cx = g.xs.reduce((s, v) => s + v, 0) / g.xs.length;
    const cy = g.ys.reduce((s, v) => s + v, 0) / g.ys.length;
    let r = 16;
    for (let i = 0; i < g.xs.length; i++) {
      r = Math.max(r, Math.hypot(g.xs[i] - cx, g.ys[i] - cy) + 16);
    }
    return { cx, cy, r: Math.min(r, 60), n: g.xs.length };
  });
}

// Crown masses: behind-the-limbs foliage silhouettes. Each proximity group of
// owned outer anchors becomes a blob of 3-5 overlapping deep-foliage ellipses
// plus one smaller up-left mid-foliage highlight blob. Deterministic per tree
// (seeded from the tree hash). Scaled by canvas size so small Overview cells
// don't get swamped. `fresh` pops the whole crown on a buy/stage change.
function buildCrown(
  treeId: TreeId,
  pts: { x: number; y: number }[],
  crownScale: number,
  fresh: boolean,
): string {
  if (pts.length === 0) return "";
  const groups = clusterPoints(pts, 4);
  let seed = 2166136261;
  for (const ch of treeId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  const rnd = segRng(seed);
  const out: string[] = [];
  const budget = 20; // max ellipses across all blobs
  let used = 0;
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const r = grp.r * crownScale;
    const popDelay = g * 60;
    const style =
      `transform-origin:${grp.cx.toFixed(1)}px ${grp.cy.toFixed(1)}px;` +
      (fresh ? `animation-delay:${popDelay}ms` : "");
    const blobEllipses: string[] = [];
    const lobes = 3 + Math.floor(rnd() * 3); // 3-5 deep
    for (let i = 0; i < lobes && used < budget; i++, used++) {
      const ang = (i / lobes) * Math.PI * 2 + rnd() * 0.6;
      const rad = r * (0.28 + rnd() * 0.35);
      const ex = grp.cx + Math.cos(ang) * rad;
      const ey = grp.cy + Math.sin(ang) * rad;
      const rx = r * (0.5 + rnd() * 0.35);
      const ry = rx * (0.72 + rnd() * 0.25);
      blobEllipses.push(
        `<ellipse class="crown-deep" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"/>`,
      );
    }
    // one up-left mid-foliage highlight blob, smaller + offset toward the light
    if (used < budget) {
      used++;
      const hx = grp.cx - r * 0.28;
      const hy = grp.cy - r * 0.3;
      const hr = r * (0.4 + rnd() * 0.2);
      blobEllipses.push(
        `<ellipse class="crown-lit" cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" rx="${hr.toFixed(1)}" ry="${(hr * 0.85).toFixed(1)}"/>`,
      );
    }
    out.push(
      `<g class="crown-blob${fresh ? " pop" : ""}" style="${style}">${blobEllipses.join("")}</g>`,
    );
  }
  return out.join("");
}

// Builds one tree's SVG inner markup via the procedural generator (§6):
// merged ink silhouette, bark fills, core-shadow ribbons, seated typed nodes,
// leaf fans on outermost owned anchors. Renders only the recursion depth the
// growth stage allows; branches arrive one stage before their nodes.
function buildTreeSvg(state: GameState, treeId: TreeId): string {
  const nodes = nodesForTree(treeId);
  const seated = seatTree(treeId);
  const { tree, pos, fit } = seated;

  // The full skeleton renders from the first frame — no stage-gated depth reveal.
  const visibleSegs = tree.segments;

  // Silhouette (all limbs, expanded +2.6px, ink fill).
  const silhouette = visibleSegs
    .map((s) => `<polygon class="tree-ink" points="${segPolygon(fit, s, 2.6)}"/>`)
    .join("");
  // Bark fills — two tones by depth parity.
  const bark = visibleSegs
    .map((s) => {
      const tone = s.depth % 2 === 0 ? "tree-bark-a" : "tree-bark-b";
      return `<polygon class="${tone}" points="${segPolygon(fit, s, 0)}"/>`;
    })
    .join("");
  // Core-shadow ribbons on major limbs only.
  const ribbons = visibleSegs
    .filter((s) => s.major)
    .map((s) => `<polygon class="tree-core" points="${segRibbon(fit, s)}"/>`)
    .join("");
  // Lit rims on the opposite (upper-left) side of major limbs (depth ≤ 1) —
  // rounds the limb under a single upper-left light source.
  const rims = visibleSegs
    .filter((s) => s.depth <= 1)
    .map((s) => `<polygon class="tree-rim" points="${segRibbonLit(fit, s)}"/>`)
    .join("");
  // Bark texture: short longitudinal strokes on depth ≤ 1 segments, capped
  // ~60 paths per tree (each seg emits 2-3; stop once we near the cap).
  const barkTexParts: string[] = [];
  let barkTexCount = 0;
  visibleSegs.forEach((s, i) => {
    if (s.depth > 1 || barkTexCount >= 60) return;
    const t = barkStrokes(fit, s, i);
    barkTexCount += (t.match(/tree-bark-tex/g) ?? []).length;
    barkTexParts.push(t);
  });
  const barkTex = barkTexParts.join("");
  // Joint caps: a bark-tone circle at each parent-tip fork (depth 1-2, the
  // first sub-segment of each child limb) to hide polygon gaps at forks.
  const jointSeen = new Set<string>();
  const jointCaps = visibleSegs
    .filter((s) => s.depth >= 1 && s.depth <= 2)
    .map((s) => {
      const key = `${s.parentTipX.toFixed(2)},${s.parentTipY.toFixed(2)}`;
      if (jointSeen.has(key)) return "";
      jointSeen.add(key);
      const p = apply(fit, s.parentTipX, s.parentTipY);
      const r = ((s.wBase * fit.s) / 2) * 0.95;
      if (r < 1.2) return "";
      const tone = s.depth % 2 === 0 ? "tree-bark-a" : "tree-bark-b";
      return `<circle class="${tone}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}"/>`;
    })
    .join("");

  // Nodes + leaf fans.
  const nodeEls: string[] = [];
  const leaves: string[] = [];
  const crownPts: { x: number; y: number }[] = [];
  const ownedNodes = nodes.filter((n) => isOwned(state, n.id));
  const ownedIds = new Set(ownedNodes.map((n) => n.id));
  // Outermost owned = owned nodes whose seated dist is in the top band.
  const ownedByDist = [...ownedNodes].sort((a, b) => (pos.get(b.id)!.dist) - (pos.get(a.id)!.dist));
  const outerCount = Math.max(1, Math.ceil(ownedByDist.length * 0.5));
  const outerSet = new Set(ownedByDist.slice(0, outerCount).map((n) => n.id));

  for (const node of nodes) {
    const a = pos.get(node.id)!;
    if (!isVisible(state, node.id)) {
      nodeEls.push(
        `<g class="tree-node hidden" data-node="${node.id}"><circle class="face" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="13"/></g>`,
      );
      continue;
    }
    const own = ownedIds.has(node.id);
    const type = nodeType(node.effect);
    const cx = a.x.toFixed(1);
    const cy = a.y.toFixed(1);
    const iconFill = ICON_FILLED.has(node.effect.kind === "stat" ? node.effect.stat : node.effect.kind);
    nodeEls.push(`
      <g class="tree-node${own ? " owned" : ""}" data-node="${node.id}" style="--node-color:${type.color};--node-ink:${type.ink}">
        <circle class="hit" cx="${cx}" cy="${cy}" r="19"/>
        <circle class="ring" cx="${cx}" cy="${cy}" r="14"/>
        <circle class="face" cx="${cx}" cy="${cy}" r="13"/>
        <g class="icon" transform="translate(${cx} ${cy}) scale(1.18)" ${iconFill ? "" : ""}>${type.icon}</g>
        ${own ? "" : `<g class="cost-pill" transform="translate(${cx} ${(a.y + 29).toFixed(1)})"><rect x="-17" y="-8" width="34" height="16" rx="8"/><text y="4">${fmt(node.cost)}</text></g>`}
      </g>`);
    if (own && outerSet.has(node.id)) {
      leaves.push(leafFan(node.id, a.x, a.y, node.id === freshNodeId));
      crownPts.push({ x: a.x, y: a.y });
    }
  }

  // Crown masses behind the limbs. S0 / barren has no owned outer anchors, so
  // crownPts is empty and no crown renders. Scale crown down for small canvases
  // (Overview cells) so blobs don't swamp the cell. `fresh` on a buy/stage
  // change pops the blobs in.
  const crownScale = treeId === "act1" ? 1 : 0.82; // act-2 saplings a touch tighter
  const crownFresh = freshNodeId !== null && ownedIds.has(freshNodeId);
  const crown = buildCrown(treeId, crownPts, crownScale, crownFresh);

  // ground shadow ellipse under the crown
  const cxRoot = 200;
  const groundEllipse = `<ellipse class="tree-ground-shadow" cx="${cxRoot}" cy="${GROUND_Y + 3}" rx="${(FIT_W * 0.42).toFixed(0)}" ry="9"/>`;

  // Grass mound: a low rounded hump under the trunk with a deep-foliage shadow
  // edge, plus a couple of root-flare tufts. Replaces the bare ground line.
  const gMound = buildGrassMound();

  return `
    ${groundEllipse}
    ${gMound}
    <g class="tree-crown" pointer-events="none">${crown}</g>
    <g class="tree-limbs">
      ${silhouette}
      ${bark}
      ${barkTex}
      ${jointCaps}
      ${ribbons}
      ${rims}
    </g>
    <g class="tree-foliage">${leaves.join("")}</g>
    <g class="tree-nodes">${nodeEls.join("")}</g>
  `;
}

// Grass mound + root-flare tufts replacing the bare ground line. A low hump
// centered under the trunk: a filled --ground path with a thin --foliage-deep
// shadow edge along its top, and a few small grass tufts sprouting up from it.
function buildGrassMound(): string {
  const y = GROUND_Y;
  const half = FIT_W * 0.5; // 160
  const left = 200 - half;
  const right = 200 + half;
  const rise = 14; // mound height above the ground line
  // filled mound (dips below viewport bottom so no seam shows)
  const moundPath =
    `M ${left} ${y + 2} ` +
    `C ${left + 40} ${y - rise} ${200 - 60} ${y - rise} 200 ${y - rise} ` +
    `C ${200 + 60} ${y - rise} ${right - 40} ${y - rise} ${right} ${y + 2} ` +
    `L ${right} ${y + 40} L ${left} ${y + 40} Z`;
  // top shadow edge (same curve, stroked)
  const edgePath =
    `M ${left} ${y + 2} ` +
    `C ${left + 40} ${y - rise} ${200 - 60} ${y - rise} 200 ${y - rise} ` +
    `C ${200 + 60} ${y - rise} ${right - 40} ${y - rise} ${right} ${y + 2}`;
  // root-flare tufts: small triangular grass blades along the mound crest
  const tufts: string[] = [];
  const tuftXs = [200 - 46, 200 - 20, 200 + 24, 200 + 50];
  for (let i = 0; i < tuftXs.length; i++) {
    const tx = tuftXs[i];
    const ty = y - rise + 4 + (i % 2) * 2;
    tufts.push(
      `<path class="tree-tuft" d="M ${tx - 4} ${ty} Q ${tx - 5} ${ty - 9} ${tx - 1} ${ty - 12} ` +
        `M ${tx} ${ty} Q ${tx} ${ty - 12} ${tx} ${ty - 14} ` +
        `M ${tx + 4} ${ty} Q ${tx + 5} ${ty - 9} ${tx + 1} ${ty - 12}"/>`,
    );
  }
  return (
    `<path class="tree-mound" d="${moundPath}"/>` +
    `<path class="tree-mound-edge" d="${edgePath}"/>` +
    tufts.join("")
  );
}

// spark + (nothing else) uses fill; icons that are stroke-based skip fill.
const ICON_FILLED = new Set<string>(["critChance", "critMult", "buffDuration"]);

function nodeTooltipHtml(nodeId: string): string {
  const node = getSkillNode(nodeId);
  const owned = isOwned(gameState, nodeId);
  const levelGated = gameState.level < node.minLevel;
  return `
    <b>${node.name}</b>
    <div class="tt-desc">${node.desc}</div>
    <div class="tt-meta">
      ${owned ? "Owned" : `Cost: ${fmt(node.cost)} gold`}
      ${!owned && node.minLevel > 1 ? ` · Level ${node.minLevel}${levelGated ? " required" : ""}` : ""}
    </div>
  `;
}

function wireTreeSvg(svg: SVGSVGElement): void {
  svg.querySelectorAll<SVGGElement>(".tree-node:not(.hidden)").forEach((g) => {
    const nodeId = g.dataset.node!;
    attachTooltip(g, () => nodeTooltipHtml(nodeId));
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!buy(gameState, nodeId)) {
        g.classList.remove("denied");
        void g.getBoundingClientRect();
        g.classList.add("denied");
      }
    });
  });
}

// ---- Wheel zoom + drag pan on the FRONT tree SVG only (act1, or the selected
// act2 tree). The background forest trees are non-interactive and never wired
// for zoom. The base viewBox is 0 0 VB_W VB_H; zoom shrinks it (min 1x =
// full, max ZOOM_MAX). Pan clamps so the content can't leave the viewport.
// State is module-local per treeId and re-applied after event-driven rebuilds
// (innerHTML is replaced, so the <svg> element is fresh each time). Node clicks
// stay per-element so they survive viewBox changes; a drag on empty background
// pans only after a small movement threshold, distinguishing it from a click.
const VB_W = 400;
const VB_H = 600;
const ZOOM_MAX = 3;
const DRAG_THRESHOLD = 5; // px of movement before a press becomes a pan

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
const zoomState: Partial<Record<TreeId, ViewBox>> = {};

function defaultViewBox(): ViewBox {
  return { x: 0, y: 0, w: VB_W, h: VB_H };
}

// Clamp a viewBox so it stays within the base 0..VB_W / 0..VB_H content bounds
// and never zooms out past 1x (w<=VB_W) or in past ZOOM_MAX.
function clampViewBox(vb: ViewBox): ViewBox {
  const minW = VB_W / ZOOM_MAX;
  const w = Math.min(VB_W, Math.max(minW, vb.w));
  const h = w * (VB_H / VB_W);
  const x = Math.min(VB_W - w, Math.max(0, vb.x));
  const y = Math.min(VB_H - h, Math.max(0, vb.y));
  return { x, y, w, h };
}

function applyViewBox(svg: SVGSVGElement, vb: ViewBox): void {
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

// Map a pointer event to viewBox coordinates given the current viewBox.
function pointerToVb(svg: SVGSVGElement, e: { clientX: number; clientY: number }, vb: ViewBox): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / (rect.width || 1);
  const fy = (e.clientY - rect.top) / (rect.height || 1);
  return { x: vb.x + fx * vb.w, y: vb.y + fy * vb.h };
}

function wireTreeZoom(svg: SVGSVGElement, treeId: TreeId): void {
  // Re-apply any preserved zoom for this tree after a rebuild.
  let vb = clampViewBox(zoomState[treeId] ?? defaultViewBox());
  zoomState[treeId] = vb;
  applyViewBox(svg, vb);

  const commit = (next: ViewBox): void => {
    vb = clampViewBox(next);
    zoomState[treeId] = vb;
    applyViewBox(svg, vb);
  };

  // Cursor-anchored wheel zoom. passive:false so we can preventDefault and the
  // page doesn't scroll while wheeling over the tree.
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const anchor = pointerToVb(svg, e, vb);
      const factor = Math.exp(-e.deltaY * 0.0015); // wheel up -> zoom in
      const newW = vb.w / factor;
      const clampedW = Math.min(VB_W, Math.max(VB_W / ZOOM_MAX, newW));
      const scale = clampedW / vb.w;
      const newH = clampedW * (VB_H / VB_W);
      // keep the anchor point fixed under the cursor
      const nx = anchor.x - (anchor.x - vb.x) * scale;
      const ny = anchor.y - (anchor.y - vb.y) * scale;
      commit({ x: nx, y: ny, w: clampedW, h: newH });
    },
    { passive: false },
  );

  // Drag on empty background pans; a press on a node bubbles here but node
  // handlers stopPropagation, and we only start panning past DRAG_THRESHOLD.
  let dragging = false;
  let moved = false;
  let startClient = { x: 0, y: 0 };
  let startVb = vb;

  svg.addEventListener("pointerdown", (e) => {
    // ignore presses that originate on an interactive node (let it click)
    if ((e.target as Element).closest(".tree-node:not(.hidden)")) return;
    dragging = true;
    moved = false;
    startClient = { x: e.clientX, y: e.clientY };
    startVb = vb;
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dxPx = e.clientX - startClient.x;
    const dyPx = e.clientY - startClient.y;
    if (!moved && Math.hypot(dxPx, dyPx) < DRAG_THRESHOLD) return;
    if (!moved) {
      moved = true;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add("panning");
    }
    const rect = svg.getBoundingClientRect();
    const vx = (dxPx / (rect.width || 1)) * startVb.w;
    const vy = (dyPx / (rect.height || 1)) * startVb.h;
    commit({ x: startVb.x - vx, y: startVb.y - vy, w: startVb.w, h: startVb.h });
  });

  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (moved) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer may already be released */
      }
      svg.classList.remove("panning");
    }
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // Double-click empty background resets to 1x.
  svg.addEventListener("dblclick", (e) => {
    if ((e.target as Element).closest(".tree-node:not(.hidden)")) return;
    commit(defaultViewBox());
  });
}

function resetTreeZoom(treeId: TreeId): void {
  zoomState[treeId] = defaultViewBox();
  // Target the FRONT (interactive) tree only — in chapter 2 the background
  // forest trees render first in the DOM, so a bare ".tree-svg" query would hit
  // a non-interactive back tree instead of the zoomable front one.
  const svg = bodyEl.querySelector<SVGSVGElement>(".tree-front");
  if (svg) applyViewBox(svg, zoomState[treeId]!);
}

// Phase V2: the grove is a forest on an island. Chapter 1 shows a single Act-1
// tree; chapter 2 shows all four Act-2 trees — the selected one full-size and
// interactive in front, the other three at reduced fit behind/beside it,
// non-interactive and desaturated, so the focused tree reads clearly. The
// ◀▶ switcher rotates which tree is in front (via state.settings.act2Tree).

function layoutKey(state: GameState): string {
  return `${state.chapter}|${state.settings.act2Tree}`;
}

// Where each BACKGROUND (non-front) tree sits: horizontal offset in canvas %,
// vertical lift (depth), and render scale. Two flank the front tree; one sits
// behind and slightly higher. Assigned in rotation order after the front tree.
const FOREST_SLOTS: { x: number; y: number; scale: number }[] = [
  { x: -34, y: 4, scale: 0.55 }, // left flank
  { x: 34, y: 4, scale: 0.55 }, // right flank
  { x: 0, y: -14, scale: 0.5 }, // behind, higher (depth)
];

function rebuildLayout(): void {
  const state = gameState;
  lastLayoutKey = layoutKey(state);
  // bodyEl.innerHTML is about to be replaced, so any cached node references
  // from the affordability pass below are stale — force a re-query.
  cachedAffordableNodes = null;
  lastAffordableKey = "";

  if (state.chapter === 1) {
    bodyEl.innerHTML = `
      <div class="tree-switcher well">
        <b>${TREE_NAMES.act1}</b>
        <button class="tree-nav" id="tree-reset" aria-label="Reset zoom" title="Reset zoom">⌂</button>
      </div>
      <div class="tree-forest">
        <svg class="tree-svg tree-front" id="tree-svg-act1" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">${buildTreeSvg(state, "act1")}</svg>
      </div>`;
    const svg = bodyEl.querySelector<SVGSVGElement>("#tree-svg-act1")!;
    wireTreeSvg(svg);
    wireTreeZoom(svg, "act1");
    bodyEl.querySelector("#tree-reset")!.addEventListener("click", () => resetTreeZoom("act1"));
    return;
  }

  // Chapter 2: forest. Front tree = the selected act2Tree; the others render
  // behind at reduced fit, non-interactive + desaturated.
  const front = state.settings.act2Tree;
  const others = ACT2_TREE_IDS.filter((id) => id !== front);
  const backLayers = others
    .map((id, i) => {
      const slot = FOREST_SLOTS[i % FOREST_SLOTS.length];
      const style =
        `transform:translate(${slot.x}%, ${slot.y}%) scale(${slot.scale});` +
        `z-index:${slot.y < 0 ? 0 : 1};`;
      return `<svg class="tree-svg tree-back" data-tree="${id}" viewBox="0 0 400 600"
        preserveAspectRatio="xMidYMax meet" style="${style}">${buildTreeSvg(state, id)}</svg>`;
    })
    .join("");

  bodyEl.innerHTML = `
    <div class="tree-switcher well">
      <button class="tree-nav" id="tree-prev" aria-label="Previous tree">◀</button>
      <b>${TREE_NAMES[front]}</b>
      <button class="tree-nav" id="tree-next" aria-label="Next tree">▶</button>
      <button class="tree-nav" id="tree-reset" aria-label="Reset zoom" title="Reset zoom">⌂</button>
    </div>
    <div class="tree-forest">
      ${backLayers}
      <svg class="tree-svg tree-front" id="tree-svg-current" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">${buildTreeSvg(state, front)}</svg>
    </div>
  `;
  const svg = bodyEl.querySelector<SVGSVGElement>("#tree-svg-current")!;
  wireTreeSvg(svg);
  wireTreeZoom(svg, front);
  bodyEl.querySelector("#tree-prev")!.addEventListener("click", () => cycleTree(-1));
  bodyEl.querySelector("#tree-next")!.addEventListener("click", () => cycleTree(1));
  bodyEl.querySelector("#tree-reset")!.addEventListener("click", () => resetTreeZoom(front));
}

function cycleTree(dir: 1 | -1): void {
  const i = ACT2_TREE_IDS.indexOf(gameState.settings.act2Tree);
  const next = ACT2_TREE_IDS[(i + dir + ACT2_TREE_IDS.length) % ACT2_TREE_IDS.length];
  gameState.settings.act2Tree = next;
  rebuildLayout();
}

// The felling wobble now targets the tree canvas (the grove's tree layer) since
// #tree-panel is no longer a top-level .world-area. buildTreeSvg's forest lives
// inside bodyEl, so the whole Act-1 tree tips as the chapter turns over.
function playFellingAnimation(): void {
  bodyEl.classList.add("felling");
  setTimeout(() => bodyEl.classList.remove("felling"), 1200);
}

export function initTreePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  gameState = state;
  panel.innerHTML = `
    <div class="area-chip">Skill Tree <span class="panel-ticker" id="tree-ticker"></span></div>
    <div class="panel-body tree-body">
      <div class="mission-slot" id="tree-mission"></div>
      <div id="tree-canvas"></div>
    </div>
  `;
  tickerEl = panel.querySelector<HTMLElement>("#tree-ticker")!;
  missionEl = panel.querySelector<HTMLElement>("#tree-mission")!;
  bodyEl = panel.querySelector<HTMLElement>("#tree-canvas")!;

  on("buy", (e) => {
    freshNodeId = e.nodeId;
    rebuildLayout();
  });
  on("chapterAdvance", () => {
    playFellingAnimation();
    rebuildLayout();
  });

  rebuildLayout();
}

export function renderTreePanel(state: GameState): void {
  if (layoutKey(state) !== lastLayoutKey) rebuildLayout();

  // Per-frame pass: pulse nodes the player can afford right now. The node
  // list only changes when the layout rebuilds (invalidated above), and
  // canBuy's result only depends on gold/level/owned-count, so skip the
  // querySelectorAll + canBuy sweep entirely unless one of those moved.
  const affordableKey = `${Math.floor(state.gold)}|${state.level}|${state.skillNodes.length}`;
  if (!cachedAffordableNodes) {
    cachedAffordableNodes = Array.from(
      bodyEl.querySelectorAll<SVGGElement>(".tree-node:not(.hidden):not(.owned)"),
    );
  }
  if (affordableKey !== lastAffordableKey) {
    for (const g of cachedAffordableNodes) {
      g.classList.toggle("affordable", canBuy(state, g.dataset.node!));
    }
    lastAffordableKey = affordableKey;
  }

  const totalNodes = SKILL_NODES.length;
  tickerEl.textContent =
    state.chapter === 1
      ? `${state.skillNodes.length}/${nodesForTree("act1").length} nodes`
      : `${state.skillNodes.length}/${totalNodes} nodes`;

  renderMissionTracker("tree", missionEl, state);
}
