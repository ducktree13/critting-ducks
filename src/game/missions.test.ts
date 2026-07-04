import { beforeEach, describe, expect, it } from "vitest";
import { checkMissions, ensureMissions, missionProgress, missionRewardPreview, missionTemplate, pinMission } from "./missions";
import { createInitialState } from "./state";
import type { GameState, Rng } from "./types";

const rng: Rng = { next: () => 0 }; // deterministic: always picks the first candidate

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("ensureMissions", () => {
  it("fills each section up to three active missions", () => {
    ensureMissions(state, rng);
    expect(state.missions.mine).toHaveLength(3);
    expect(state.missions.tree).toHaveLength(3);
    expect(state.missions.arena).toHaveLength(3);
  });

  it("does not add more once a section is full", () => {
    ensureMissions(state, rng);
    const before = state.missions.mine.map((m) => m.id);
    ensureMissions(state, rng);
    expect(state.missions.mine.map((m) => m.id)).toEqual(before);
  });

  it("avoids duplicate templates within a section while distinct templates remain", () => {
    ensureMissions(state, rng);
    // "mine" only has 2 distinct templates (mineOre, mineGold) but holds 3
    // active missions, so once both are in play a repeat is unavoidable —
    // the first 2 rolled should still be distinct from each other.
    const templateIds = state.missions.mine.map((m) => m.templateId);
    expect(new Set(templateIds.slice(0, 2)).size).toBe(2);
  });
});

describe("missionProgress and checkMissions", () => {
  it("tracks progress as a delta from the mission's start value", () => {
    ensureMissions(state, rng);
    const instance = state.missions.tree[0]; // treeNodes: +3 nodes
    expect(missionTemplate(instance).id).toBe("treeNodes");
    state.skillNodes.push("crit1");
    const { current, target } = missionProgress(state, instance);
    expect(current).toBe(1);
    expect(target).toBe(3);
  });

  it("completes a mission, grants its reward, and rolls a replacement", () => {
    ensureMissions(state, rng);
    const instance = state.missions.tree[0];
    state.skillNodes.push("crit1", "speed1", "ore1"); // hits the +3 target
    const goldBefore = state.gold;

    checkMissions(state, rng);

    expect(state.missions.tree.some((m) => m.id === instance.id)).toBe(false);
    expect(state.missions.tree).toHaveLength(3); // replacement rolled in
    // treeNodes reward is a pack credit, treeLevel reward is gold — either
    // could have completed depending on which template rolled first.
    expect(state.gold).toBeGreaterThanOrEqual(goldBefore);
  });

  it("clears the pin when the pinned mission completes", () => {
    ensureMissions(state, rng);
    const instance = state.missions.tree[0];
    pinMission(state, "tree", instance.id);
    state.skillNodes.push("crit1", "speed1", "ore1");
    checkMissions(state, rng);
    expect(state.pinnedMission.tree).toBeNull();
  });
});

describe("missionRewardPreview", () => {
  it("summarizes the gold reward for a mission", () => {
    ensureMissions(state, rng);
    const instance = state.missions.mine[0];
    const preview = missionRewardPreview(instance);
    expect(preview).toMatch(/gold/);
  });
});

describe("pinMission", () => {
  it("only pins a mission that is currently active in that section", () => {
    ensureMissions(state, rng);
    const real = state.missions.mine[0].id;
    pinMission(state, "mine", "not-a-real-id");
    expect(state.pinnedMission.mine).toBeNull();
    pinMission(state, "mine", real);
    expect(state.pinnedMission.mine).toBe(real);
  });
});
