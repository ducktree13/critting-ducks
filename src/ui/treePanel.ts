import { ACT2_TREE_IDS, treeProgress } from "../game/chapters";
import { on } from "../game/events";
import { clickLeaf } from "../game/leaves";
import { buy, canBuy, getSkillNode, isOwned, isVisible, nodesForTree, SKILL_NODES } from "../game/skilltree";
import type { GameState, NodeEffect, SkillNode, TreeId } from "../game/types";
import { fmt } from "./format";
import { renderMissionTracker } from "./missionsPanel";
import { attachTooltip } from "./tooltip";

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

function glyph(effect: NodeEffect): string {
  switch (effect.kind) {
    case "slot": return "+";
    case "oreUnlock": return "◆";
    case "offline": return "☾";
    case "buffDuration": return "∞";
    case "stat":
      switch (effect.stat) {
        case "critChance": return "✦";
        case "critMult": return "✸";
        case "orePerHit": case "oreMult": return "⛏";
        case "flatAttack": case "attackDamageMult": return "⚔";
        case "flatDefense": case "defenseMult": return "⛨";
        case "xpMult": return "☆";
        case "goldMult": return "$";
        default: return "»";
      }
  }
}

// Deterministic tiny PRNG per node id so leaf clusters are stable.
function leafSeeds(id: string, count: number): { dx: number; dy: number; rot: number }[] {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < count; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const a = ((h >>> 8) % 360) * (Math.PI / 180);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    const r = 20 + ((h >>> 8) % 8);
    out.push({ dx: Math.cos(a) * r, dy: Math.sin(a) * r, rot: (h >>> 4) % 360 });
  }
  return out;
}

function canopyLeavesFor(node: SkillNode): string {
  const count = 3 + (node.id.length % 3); // 3–5 leaves
  const pop = node.id === freshNodeId ? " pop" : "";
  return leafSeeds(node.id, count)
    .map(
      (l, i) =>
        `<ellipse class="leaf${pop}" cx="${node.x + l.dx}" cy="${node.y + l.dy}" rx="7" ry="4"
          transform="rotate(${l.rot} ${node.x + l.dx} ${node.y + l.dy})"
          style="animation-delay: ${i * 60}ms"/>`,
    )
    .join("");
}

function edgePath(parent: SkillNode, child: SkillNode): string {
  const midY = (parent.y + child.y) / 2;
  return `M ${parent.x} ${parent.y} C ${parent.x} ${midY}, ${child.x} ${midY}, ${child.x} ${child.y}`;
}

// Builds one tree's SVG inner markup (trunk art + edges + nodes + canopy),
// scaled by how much of it is owned so a fresh sapling looks tiny next to a
// nearly-finished grove.
function buildTreeSvg(state: GameState, treeId: TreeId): string {
  const nodes = nodesForTree(treeId);
  const edges: string[] = [];
  const nodeEls: string[] = [];
  const canopy: string[] = [];

  for (const node of nodes) {
    if (node.requires) {
      const parent = getSkillNode(node.requires);
      const lit = isOwned(state, node.id);
      edges.push(`<path class="tree-edge${lit ? " lit" : ""}" d="${edgePath(parent, node)}"/>`);
    }

    if (!isVisible(state, node.id)) {
      nodeEls.push(`<g class="tree-node silhouette" data-node="${node.id}"><circle cx="${node.x}" cy="${node.y}" r="13"/></g>`);
      continue;
    }

    const owned = isOwned(state, node.id);
    nodeEls.push(`
      <g class="tree-node${owned ? " owned" : ""}" data-node="${node.id}">
        <circle class="hit" cx="${node.x}" cy="${node.y}" r="18"/>
        <circle class="face" cx="${node.x}" cy="${node.y}" r="13"/>
        <text class="glyph" x="${node.x}" y="${node.y + 4}">${glyph(node.effect)}</text>
        ${owned ? "" : `<text class="cost" x="${node.x}" y="${node.y + 30}">${fmt(node.cost)}</text>`}
      </g>`);
    if (owned) canopy.push(canopyLeavesFor(node));
  }

  const trunkArt =
    treeId === "act1"
      ? `<path class="tree-trunk" d="M 200 572 L 200 400"/>
         <path class="tree-limb" d="M 200 470 C 170 460, 150 455, 140 450"/>
         <path class="tree-limb" d="M 200 470 C 230 460, 250 455, 260 450"/>
         <path class="tree-limb" d="M 200 400 C 195 375, 185 355, 180 335"/>
         <path class="tree-limb" d="M 200 400 C 215 375, 228 358, 235 340"/>`
      : `<path class="tree-trunk" d="M 200 572 L 200 60"/>`;

  const progress = treeProgress(state, treeId);
  const scale = 0.35 + 0.65 * progress; // sapling -> full canopy
  return `
    <g transform="translate(200 572) scale(${scale}) translate(-200 -572)">
      <line class="tree-ground" x1="40" y1="572" x2="360" y2="572"/>
      ${trunkArt}
      ${edges.join("")}
      ${nodeEls.join("")}
      ${canopy.join("")}
    </g>
  `;
}

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
  svg.querySelectorAll<SVGGElement>(".tree-node:not(.silhouette)").forEach((g) => {
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

export function initTreePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  gameState = state;
  panel.innerHTML = `
    <h2>Skill Tree <span class="panel-ticker" id="tree-ticker"></span></h2>
    <div class="panel-body tree-body">
      <div class="mission-slot" id="tree-mission"></div>
      <div id="tree-canvas"></div>
      <div id="falling-leaves"></div>
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

  // Cheap per-frame pass: pulse nodes the player can afford right now.
  bodyEl.querySelectorAll<SVGGElement>(".tree-node:not(.silhouette):not(.owned)").forEach((g) => {
    g.classList.toggle("affordable", canBuy(state, g.dataset.node!));
  });

  const totalNodes = SKILL_NODES.length;
  tickerEl.textContent =
    state.chapter === 1
      ? `${state.skillNodes.length}/${nodesForTree("act1").length} nodes`
      : `${state.skillNodes.length}/${totalNodes} nodes`;

  renderMissionTracker("tree", missionEl, state);
  renderLeaves(state);
}
