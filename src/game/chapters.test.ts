import { beforeEach, describe, expect, it } from "vitest";
import { on } from "./events";
import { checkChapterTransition, treeProgress } from "./chapters";
import { nodesForTree } from "./skilltree";
import { createInitialState } from "./state";
import type { GameState } from "./types";

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("checkChapterTransition", () => {
  it("stays on chapter 1 until every Act 1 node is owned", () => {
    state.skillNodes = nodesForTree("act1").slice(0, -1).map((n) => n.id);
    checkChapterTransition(state);
    expect(state.chapter).toBe(1);
  });

  it("advances to chapter 2 once Act 1 is fully owned, arming the leaf timer", () => {
    state.skillNodes = nodesForTree("act1").map((n) => n.id);
    checkChapterTransition(state);
    expect(state.chapter).toBe(2);
    expect(state.nextLeafAt).toBeGreaterThan(0);
  });

  it("fires chapterAdvance exactly once", () => {
    state.skillNodes = nodesForTree("act1").map((n) => n.id);
    let fired = 0;
    const off = on("chapterAdvance", () => fired++);
    checkChapterTransition(state);
    checkChapterTransition(state); // already chapter 2, must not refire
    off();
    expect(fired).toBe(1);
  });
});

describe("treeProgress", () => {
  it("is 0 for an untouched Act-2 tree", () => {
    expect(treeProgress(state, "mining2")).toBe(0);
  });

  it("scales linearly with owned nodes", () => {
    const nodes = nodesForTree("mining2");
    state.skillNodes = [nodes[0].id];
    expect(treeProgress(state, "mining2")).toBeCloseTo(1 / nodes.length);
  });

  it("is 1 once every node in that tree is owned", () => {
    state.skillNodes = nodesForTree("combat2").map((n) => n.id);
    expect(treeProgress(state, "combat2")).toBe(1);
  });
});
