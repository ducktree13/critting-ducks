import { describe, expect, it } from "vitest";
import { nodesForTree } from "../game/skilltree";
import type { TreeId } from "../game/types";
import { generateTree, thinAnchors } from "./treegen";

// Mirror of the render fit + thinning used by treePanel.seatTree so the test
// asserts on the exact on-screen geometry the panel produces. Keep these in
// sync with treePanel.ts (FIT_W/GROUND_Y/FIT_TOP/TREE_SCALE/TARGET_SEP_PX).
const FIT_W = 360;
const GROUND_Y = 572;
const FIT_TOP = 40;
const TREE_SCALE = 0.95;
const TARGET_SEP_PX = 32;
const TARGET_SEP_FLOOR_PX = 26;

function fitScale(bounds: { minX: number; minY: number; maxX: number; maxY: number }): number {
  const w = bounds.maxX - bounds.minX || 1;
  const h = bounds.maxY - bounds.minY || 1;
  return Math.min(FIT_W / w, (GROUND_Y - FIT_TOP) / h) * TREE_SCALE;
}

// Seat nodes exactly as the panel does and return their fitted (viewBox) coords.
function seatFitted(treeId: TreeId): { x: number; y: number }[] {
  const cap = treeId === "act1" ? 30 : 16;
  const tree = generateTree(treeId);
  const s = fitScale(tree.bounds);
  const tx = 200 - ((tree.bounds.minX + tree.bounds.maxX) / 2) * s;
  const ty = GROUND_Y;
  const minSep = TARGET_SEP_PX / s;
  const floorSep = TARGET_SEP_FLOOR_PX / s;
  const seatable = thinAnchors(tree.anchors, cap, minSep, floorSep);
  const nodeCount = nodesForTree(treeId).length;
  // The panel seats each node onto an anchor (clamped index) — take the first
  // `nodeCount` seatable anchors, which is what determines rendered positions.
  return seatable
    .slice(0, nodeCount)
    .map((a) => ({ x: tx + a.x * s, y: ty + a.y * s }));
}

function minPairwise(pts: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    }
  }
  return min;
}

describe("treegen determinism", () => {
  it("generates the same tree for the same id every call", () => {
    const a = generateTree("act1");
    const b = generateTree("act1");
    expect(a.segments.length).toBe(b.segments.length);
    expect(a.anchors.length).toBe(b.anchors.length);
    expect(a.anchors[0]).toEqual(b.anchors[0]);
  });

  it("returns raw (unthinned) anchors sorted by root distance", () => {
    const t = generateTree("act1");
    for (let i = 1; i < t.anchors.length; i++) {
      expect(t.anchors[i].dist).toBeGreaterThanOrEqual(t.anchors[i - 1].dist);
    }
  });
});

describe("node seating spacing (final render space)", () => {
  const trees: TreeId[] = ["act1", "mining2", "combat2", "crit2", "passive2"];

  for (const treeId of trees) {
    it(`seats all ${treeId} nodes with no overlapping pairs`, () => {
      const nodeCount = nodesForTree(treeId).length;
      const pts = seatFitted(treeId);
      // every node gets a distinct seatable anchor
      expect(pts.length).toBe(nodeCount);
      // no two seated node centers closer than the floor separation (px)
      expect(minPairwise(pts)).toBeGreaterThanOrEqual(TARGET_SEP_FLOOR_PX - 0.01);
    });
  }
});
