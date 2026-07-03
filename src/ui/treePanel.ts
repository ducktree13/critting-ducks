import { ACT2_TREE_IDS } from "../game/chapters";
import { on } from "../game/events";
import { clickLeaf } from "../game/leaves";
import { pondIncomePerSec } from "../game/pond";
import { buy, canBuy, getSkillNode, isOwned, isVisible, nodesForTree, SKILL_NODES } from "../game/skilltree";
import { getStats } from "../game/state";
import type { GameState, NodeEffect, SkillNode, TreeId } from "../game/types";
import { duckSvg, duckTooltipHtml } from "./duckArt";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { openRosterPicker } from "./rosterPicker";
import { attachTooltip } from "./tooltip";
import {
  generateTree,
  stageDepth,
  stageFor,
  stageScale,
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
const FIT_W = 320; // usable width inside the 400 viewBox
const FIT_TOP = 40; // top margin

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

function seatTree(treeId: TreeId, stage: number): Seated {
  const nodes = nodesForTree(treeId);
  const cap = treeId === "act1" ? 30 : 16;
  const tree = generateTree(treeId, 4, cap);
  const fit = fitTransform(tree);
  // Stages render the same tree scaled 0.5 -> 1 (§6). Fold the stage scale into
  // the fit about the pinned root so the whole tree grows in size with owned
  // count; re-center horizontally at the reduced scale.
  const sc = stageScale(stage);
  fit.s *= sc;
  fit.tx = 200 - ((tree.bounds.minX + tree.bounds.maxX) / 2) * fit.s;

  // Order nodes topologically (chain depth, then cost) and anchors by
  // root-distance; zip them so parents always sit closer to the root.
  const ordered = [...nodes].sort((a, b) => {
    const da = chainDepth(a);
    const db = chainDepth(b);
    return da !== db ? da - db : a.cost - b.cost;
  });
  const anchors = [...tree.anchors].sort((a, b) => a.dist - b.dist);

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

// Builds one tree's SVG inner markup via the procedural generator (§6):
// merged ink silhouette, bark fills, core-shadow ribbons, seated typed nodes,
// leaf fans on outermost owned anchors. Renders only the recursion depth the
// growth stage allows; branches arrive one stage before their nodes.
function buildTreeSvg(state: GameState, treeId: TreeId): string {
  const nodes = nodesForTree(treeId);
  const total = nodes.length;
  const owned = nodes.filter((n) => isOwned(state, n.id)).length;
  const stage = stageFor(owned, total);
  const seated = seatTree(treeId, stage);
  const { tree, pos, fit } = seated;

  // Which recursion depth is visible: branches arrive one stage early.
  const shownDepth = stageDepth(stage, 4) + 1; // "bare one stage ahead"
  const visibleSegs = tree.segments.filter((s) => s.depth <= shownDepth);
  const prevDepth = stageDepth(lastStage[treeId] ?? stage, 4) + 1;

  // Silhouette (all visible limbs, expanded +2.6px, ink fill).
  const silhouette = visibleSegs
    .map((s) => `<polygon class="tree-ink" points="${segPolygon(fit, s, 2.6)}"/>`)
    .join("");
  // Bark fills — two tones by depth parity.
  const bark = visibleSegs
    .map((s) => {
      const grow = s.depth > prevDepth ? " grow" : "";
      const p = apply(fit, s.parentTipX, s.parentTipY);
      const origin = grow ? ` style="transform-origin:${p.x.toFixed(1)}px ${p.y.toFixed(1)}px"` : "";
      const tone = s.depth % 2 === 0 ? "tree-bark-a" : "tree-bark-b";
      return `<polygon class="${tone}${grow}" points="${segPolygon(fit, s, 0)}"${origin}/>`;
    })
    .join("");
  // Core-shadow ribbons on major limbs only.
  const ribbons = visibleSegs
    .filter((s) => s.major)
    .map((s) => `<polygon class="tree-core" points="${segRibbon(fit, s)}"/>`)
    .join("");

  // Nodes + leaf fans.
  const nodeEls: string[] = [];
  const leaves: string[] = [];
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
        `<g class="tree-node hidden" data-node="${node.id}"><circle class="face" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="11"/></g>`,
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
        <circle class="hit" cx="${cx}" cy="${cy}" r="17"/>
        <circle class="ring" cx="${cx}" cy="${cy}" r="12"/>
        <circle class="face" cx="${cx}" cy="${cy}" r="11"/>
        <g class="icon" transform="translate(${cx} ${cy})" ${iconFill ? "" : ""}>${type.icon}</g>
        ${own ? "" : `<g class="cost-pill" transform="translate(${cx} ${(a.y + 26).toFixed(1)})"><rect x="-16" y="-8" width="32" height="15" rx="7"/><text y="3">${fmt(node.cost)}</text></g>`}
      </g>`);
    if (own && outerSet.has(node.id)) {
      leaves.push(leafFan(node.id, a.x, a.y, node.id === freshNodeId));
    }
  }

  // ground shadow ellipse under the crown
  const cxRoot = 200;
  const groundEllipse = `<ellipse class="tree-ground-shadow" cx="${cxRoot}" cy="${GROUND_Y + 3}" rx="${(FIT_W * 0.42).toFixed(0)}" ry="9"/>`;

  lastStage[treeId] = stage;

  return `
    ${groundEllipse}
    <line class="tree-ground" x1="40" y1="${GROUND_Y}" x2="360" y2="${GROUND_Y}"/>
    <g class="tree-limbs">
      ${silhouette}
      ${bark}
      ${ribbons}
    </g>
    <g class="tree-foliage">${leaves.join("")}</g>
    <g class="tree-nodes">${nodeEls.join("")}</g>
  `;
}

// spark + (nothing else) uses fill; icons that are stroke-based skip fill.
const ICON_FILLED = new Set<string>(["critChance", "critMult", "buffDuration"]);

// Track the last-rendered stage per tree so a stage advance can animate only
// the newly-revealed segments (scale-in from parent joint).
const lastStage: Partial<Record<TreeId, number>> = {};

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

function isOverviewMode(state: GameState): boolean {
  return state.chapter === 2 && state.settings.panelsMinimized.mine && state.settings.panelsMinimized.arena;
}

function layoutKey(state: GameState): string {
  return `${state.chapter}|${isOverviewMode(state)}|${state.settings.act2Tree}`;
}

function rebuildLayout(): void {
  const state = gameState;
  lastLayoutKey = layoutKey(state);

  if (state.chapter === 1) {
    bodyEl.innerHTML = `<svg class="tree-svg" id="tree-svg-act1" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">${buildTreeSvg(state, "act1")}</svg>`;
    wireTreeSvg(bodyEl.querySelector<SVGSVGElement>("#tree-svg-act1")!);
    return;
  }

  if (isOverviewMode(state)) {
    bodyEl.innerHTML = `
      <div class="tree-overview">
        ${ACT2_TREE_IDS.map(
          (id) => `
          <div class="tree-overview-cell">
            <small>${TREE_NAMES[id]}</small>
            <svg class="tree-svg" data-tree="${id}" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">${buildTreeSvg(state, id)}</svg>
          </div>`,
        ).join("")}
      </div>
    `;
    bodyEl.querySelectorAll<SVGSVGElement>("svg[data-tree]").forEach(wireTreeSvg);
    return;
  }

  const current = state.settings.act2Tree;
  bodyEl.innerHTML = `
    <div class="tree-switcher">
      <button class="tree-nav" id="tree-prev" aria-label="Previous tree">◀</button>
      <b>${TREE_NAMES[current]}</b>
      <button class="tree-nav" id="tree-next" aria-label="Next tree">▶</button>
    </div>
    <svg class="tree-svg" id="tree-svg-current" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">${buildTreeSvg(state, current)}</svg>
  `;
  wireTreeSvg(bodyEl.querySelector<SVGSVGElement>("#tree-svg-current")!);
  bodyEl.querySelector("#tree-prev")!.addEventListener("click", () => cycleTree(-1));
  bodyEl.querySelector("#tree-next")!.addEventListener("click", () => cycleTree(1));
}

function cycleTree(dir: 1 | -1): void {
  const i = ACT2_TREE_IDS.indexOf(gameState.settings.act2Tree);
  const next = ACT2_TREE_IDS[(i + dir + ACT2_TREE_IDS.length) % ACT2_TREE_IDS.length];
  gameState.settings.act2Tree = next;
  rebuildLayout();
}

function playFellingAnimation(): void {
  panel.classList.add("felling");
  setTimeout(() => panel.classList.remove("felling"), 1200);
}

// ---- Falling leaves (reward drops, PLAN2.md §9) ----

function renderLeaves(state: GameState): void {
  const layer = panel.querySelector<HTMLElement>("#falling-leaves")!;
  const existing = new Set(Array.from(layer.children).map((c) => (c as HTMLElement).dataset.leaf));
  const current = new Set(state.leaves.map((l) => l.id));

  for (const el of Array.from(layer.children)) {
    const id = (el as HTMLElement).dataset.leaf!;
    if (!current.has(id)) el.remove();
  }

  for (const leaf of state.leaves) {
    if (existing.has(leaf.id)) continue;
    const el = document.createElement("button");
    el.className = `falling-leaf${leaf.kind === "duck" ? " rare" : ""}`;
    el.dataset.leaf = leaf.id;
    el.style.left = `${20 + (hashLeaf(leaf.id) % 60)}%`;
    el.textContent = leaf.kind === "duck" ? "🍂✨" : "🍂";
    el.addEventListener("click", () => {
      const clicked = state.leaves.find((l) => l.id === leaf.id);
      if (clicked && clickLeaf(state, leaf.id)) {
        el.remove();
      }
    });
    layer.appendChild(el);
  }
}

function hashLeaf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 100;
}

// ---- Pond (passive generation, PLAN2.md §10) — always visible beneath
// the trees, in every view mode. ----

let lastPondRosterKey = "";

function pondRosterKey(state: GameState): string {
  return state.rosters.pond.join(",") + "|" + getStats(state).pondSlots;
}

function rebuildPondRoster(state: GameState): void {
  const strip = panel.querySelector<HTMLElement>("#pond-strip")!;
  const stats = getStats(state);
  const slots: string[] = [];
  for (let i = 0; i < stats.pondSlots; i++) {
    const defId = state.rosters.pond[i];
    if (defId) {
      const ascension = state.ducks.find((d) => d.defId === defId)?.ascension ?? 0;
      slots.push(`<div class="duck-slot pond-duck" data-duck="${defId}" data-slot="${i}">${duckSvg(defId, 40, { ascension, ringed: false })}</div>`);
    } else {
      slots.push(`<div class="duck-slot empty pond-empty" data-slot="${i}" title="Assign a duck to swim">+</div>`);
    }
  }
  strip.querySelector("#pond-slots")!.innerHTML = slots.join("");
  strip.querySelectorAll<HTMLElement>(".duck-slot").forEach((slot) => {
    slot.addEventListener("click", () => openRosterPicker(state, "pond", Number(slot.dataset.slot)));
    const defId = slot.dataset.duck;
    if (defId) {
      const duck = state.ducks.find((d) => d.defId === defId);
      if (duck) attachTooltip(slot, () => duckTooltipHtml(state, duck));
    }
  });
  lastPondRosterKey = pondRosterKey(state);
}

function renderPond(state: GameState): void {
  if (pondRosterKey(state) !== lastPondRosterKey) rebuildPondRoster(state);
  const income = pondIncomePerSec(state, getStats(state));
  const ticker = panel.querySelector<HTMLElement>("#pond-ticker")!;
  ticker.textContent = income.goldPerSec > 0 ? `${fmt(income.goldPerSec * 3600)}/hr` : "idle";
}

export function initTreePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  gameState = state;
  panel.innerHTML = `
    <h2>Skill Tree <span class="panel-ticker" id="tree-ticker"></span></h2>
    <div class="panel-body tree-body">
      <div class="mission-slot" id="tree-mission"></div>
      <div id="tree-canvas"></div>
      <div id="falling-leaves"></div>
      <div class="pond-strip" id="pond-strip">
        <div class="pond-header"><small>🌊 Pond</small><small id="pond-ticker"></small></div>
        <div class="pond-slots" id="pond-slots"></div>
      </div>
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
  on("roster", () => rebuildPondRoster(gameState));

  rebuildLayout();
  rebuildPondRoster(state);
}

export function renderTreePanel(state: GameState): void {
  if (layoutKey(state) !== lastLayoutKey) rebuildLayout();

  // Cheap per-frame pass: pulse nodes the player can afford right now.
  bodyEl.querySelectorAll<SVGGElement>(".tree-node:not(.hidden):not(.owned)").forEach((g) => {
    g.classList.toggle("affordable", canBuy(state, g.dataset.node!));
  });

  const totalNodes = SKILL_NODES.length;
  tickerEl.textContent =
    state.chapter === 1
      ? `${state.skillNodes.length}/${nodesForTree("act1").length} nodes`
      : `${state.skillNodes.length}/${totalNodes} nodes`;

  renderMissionTracker("tree", missionEl, state);
  renderLeaves(state);
  renderPond(state);
}
