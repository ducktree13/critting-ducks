import { on } from "../game/events";
import { buy, canBuy, getSkillNode, isOwned, isVisible, SKILL_NODES } from "../game/skilltree";
import type { GameState, NodeEffect, SkillNode } from "../game/types";
import { fmt } from "./format";

let panel: HTMLElement;
let svgEl: SVGSVGElement;
let tooltipEl: HTMLElement;
let gameState: GameState;
let openNodeId: string | null = null;
let freshNodeId: string | null = null; // most recently bought — its leaves pop

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

function leavesFor(node: SkillNode): string {
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

function rebuild(): void {
  const state = gameState;
  const edges: string[] = [];
  const nodes: string[] = [];
  const leaves: string[] = [];

  for (const node of SKILL_NODES) {
    if (node.requires) {
      const parent = getSkillNode(node.requires);
      const lit = isOwned(state, node.id);
      edges.push(
        `<path class="tree-edge${lit ? " lit" : ""}" d="${edgePath(parent, node)}"/>`,
      );
    }

    if (!isVisible(state, node.id)) {
      nodes.push(
        `<g class="tree-node silhouette" data-node="${node.id}">
          <circle cx="${node.x}" cy="${node.y}" r="13"/>
        </g>`,
      );
      continue;
    }

    const owned = isOwned(state, node.id);
    nodes.push(
      `<g class="tree-node${owned ? " owned" : ""}" data-node="${node.id}">
        <circle class="hit" cx="${node.x}" cy="${node.y}" r="18"/>
        <circle class="face" cx="${node.x}" cy="${node.y}" r="13"/>
        <text class="glyph" x="${node.x}" y="${node.y + 4}">${glyph(node.effect)}</text>
        ${owned ? "" : `<text class="cost" x="${node.x}" y="${node.y + 30}">${fmt(node.cost)}</text>`}
      </g>`,
    );
    if (owned) leaves.push(leavesFor(node));
  }

  svgEl.innerHTML = `
    <line class="tree-ground" x1="40" y1="572" x2="360" y2="572"/>
    <path class="tree-trunk" d="M 200 572 L 200 400"/>
    <path class="tree-limb" d="M 200 470 C 170 460, 150 455, 140 450"/>
    <path class="tree-limb" d="M 200 470 C 230 460, 250 455, 260 450"/>
    <path class="tree-limb" d="M 200 400 C 195 375, 185 355, 180 335"/>
    <path class="tree-limb" d="M 200 400 C 215 375, 228 358, 235 340"/>
    ${edges.join("")}
    ${nodes.join("")}
    ${leaves.join("")}
  `;

  svgEl.querySelectorAll<SVGGElement>(".tree-node:not(.silhouette)").forEach((g) => {
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      openTooltip(g.dataset.node!);
    });
  });
}

function openTooltip(nodeId: string): void {
  openNodeId = nodeId;
  const node = getSkillNode(nodeId);
  const owned = isOwned(gameState, nodeId);
  const levelGated = gameState.level < node.minLevel;

  tooltipEl.innerHTML = `
    <b>${node.name}</b>
    <div class="tt-desc">${node.desc}</div>
    <div class="tt-meta">
      ${owned ? "Owned" : `Cost: ${fmt(node.cost)} gold`}
      ${!owned && node.minLevel > 1 ? ` · Level ${node.minLevel}${levelGated ? " required" : ""}` : ""}
    </div>
    ${owned ? "" : `<button class="tt-buy" id="tt-buy">Buy</button>`}
  `;
  tooltipEl.style.left = `${(node.x / 400) * 100}%`;
  tooltipEl.style.top = `${(node.y / 600) * 100}%`;
  tooltipEl.classList.add("open");

  tooltipEl.querySelector<HTMLButtonElement>("#tt-buy")?.addEventListener("click", () => {
    if (buy(gameState, nodeId)) closeTooltip();
  });
  updateTooltipBuyState();
}

function closeTooltip(): void {
  openNodeId = null;
  tooltipEl.classList.remove("open");
}

function updateTooltipBuyState(): void {
  if (!openNodeId) return;
  const btn = tooltipEl.querySelector<HTMLButtonElement>("#tt-buy");
  if (btn) btn.disabled = !canBuy(gameState, openNodeId);
}

export function initTreePanel(root: HTMLElement, state: GameState): void {
  panel = root;
  gameState = state;
  panel.innerHTML = `
    <h2>Skill Tree</h2>
    <div class="panel-body tree-body">
      <svg id="tree-svg" viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet"></svg>
      <div class="tree-tooltip" id="tree-tooltip"></div>
    </div>
  `;
  svgEl = panel.querySelector<SVGSVGElement>("#tree-svg")!;
  tooltipEl = panel.querySelector<HTMLElement>("#tree-tooltip")!;

  panel.addEventListener("click", closeTooltip);
  tooltipEl.addEventListener("click", (e) => e.stopPropagation());

  on("buy", (e) => {
    freshNodeId = e.nodeId;
    rebuild();
  });

  rebuild();
}

export function renderTreePanel(state: GameState): void {
  // Cheap per-frame pass: pulse nodes the player can afford right now.
  svgEl.querySelectorAll<SVGGElement>(".tree-node:not(.silhouette):not(.owned)").forEach((g) => {
    g.classList.toggle("affordable", canBuy(state, g.dataset.node!));
  });
  updateTooltipBuyState();
}
