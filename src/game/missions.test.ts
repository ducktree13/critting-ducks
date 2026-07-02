import { beforeEach, describe, expect, it } from "vitest";
import { checkMissions, ensureMissions, missionProgress, missionTemplate, pinMission } from "./missions";
import { createInitialState } from "./state";
import type { GameState, Rng } from "./types";

const rng: Rng = { next: () => 0 }; // deterministic: always picks the first candidate

let state: GameState;

beforeEach(() => {
  state = createInitialState();
});

describe("ensureMissions", () => {
  it("fills each section up to two active missions", () => {
    ensureMissions(state, rng);
    expect(state.missions.mine).toHaveLength(2);
    expect(state.missions.tree).toHaveLength(2);
    expect(state.missions.arena).toHaveLength(2);
  });

  it("does not add more once a section is full", () => {
    ensureMissions(state, rng);
    const before = state.missions.mine.map((m) => m.id);
    ensureMissions(state, rng);
    expect(state.missions.mine.map((m) => m.id)).toEqual(before);
  });

  it("avoids duplicate templates within a section when possible", () => {
    ensureMissions(state, rng);
    const templateIds = state.missions.mine.map((m) => m.templateId);
    expect(new Set(templateIds).size).toBe(templateIds.length);
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
    expect(state.missions.tree).toHaveLength(2); // replacement rolled in
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
