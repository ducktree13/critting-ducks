import { emit } from "./events";
import { ACT2_TREE_IDS, isAct1Complete, nodesForTree } from "./skilltree";
import type { GameState, TreeId } from "./types";

// Checks for the Act 1 -> Act 2 transition once per tick; fires a one-time
// event (not replayed on reload) so the UI can play the felling animation.
// Pond bubbles (Phase R3) run independently of chapter from game start, so
// there's no timer to arm here anymore.
export function checkChapterTransition(state: GameState): void {
  if (state.chapter === 1 && isAct1Complete(state)) {
    state.chapter = 2;
    emit("chapterAdvance", { chapter: 2 });
  }
}

// Fraction (0..1) of a tree's nodes owned — drives its rendered size, so a
// fresh Act-2 sapling starts tiny and fills out toward a full canopy.
export function treeProgress(state: GameState, treeId: TreeId): number {
  const nodes = nodesForTree(treeId);
  if (nodes.length === 0) return 0;
  const owned = nodes.filter((n) => state.skillNodes.includes(n.id)).length;
  return owned / nodes.length;
}

export function isAct2Unlocked(state: GameState): boolean {
  return state.chapter === 2;
}

export { ACT2_TREE_IDS };
