import { LEAVES } from "./balance";
import { emit } from "./events";
import { grantDuck } from "./packs";
import { applyReward, grantXp } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

let nextLeafId = 1;

function scheduleNextLeaf(state: GameState, nowMs: number, rng: Rng): void {
  const gap = LEAVES.minGapMs + rng.next() * (LEAVES.maxGapMs - LEAVES.minGapMs);
  state.nextLeafAt = nowMs + gap;
}

function spawnLeaf(state: GameState, nowMs: number, rng: Rng, stats: DerivedStats): void {
  const isCrit = rng.next() < stats.critChance;
  const isDuckTree = rng.next() < LEAVES.duckTreeChance;
  const kind = isDuckTree ? "duck" : rng.next() < 0.5 ? "gold" : "xp";
  const base = kind === "gold" ? LEAVES.goldPerLevel * state.level : LEAVES.xpPerLevel * state.level;
  const amount = kind === "duck" ? 0 : Math.round(base * (isCrit ? LEAVES.critMult : 1));

  state.leaves.push({
    id: `leaf${nextLeafId++}`,
    spawnedAt: nowMs,
    expiresAt: nowMs + LEAVES.expiresAfterMs,
    kind,
    amount,
    isCrit,
  });
}

// Only the grown Act-2 trees drop leaves. Real-time driven (not scaled by
// the streak's gameSpeed), so call with wall-clock Date.now().
export function tickLeaves(state: GameState, nowMs: number, rng: Rng, stats: DerivedStats): void {
  if (state.chapter !== 2) return;
  state.leaves = state.leaves.filter((l) => l.expiresAt > nowMs);
  if (nowMs < state.nextLeafAt) return;
  if (state.leaves.length === 0) spawnLeaf(state, nowMs, rng, stats);
  scheduleNextLeaf(state, nowMs, rng);
}

// Applies the leaf's reward and removes it. Returns false if it already
// expired or was already clicked.
export function clickLeaf(state: GameState, leafId: string): boolean {
  const leaf = state.leaves.find((l) => l.id === leafId);
  if (!leaf) return false;
  state.leaves = state.leaves.filter((l) => l.id !== leafId);

  if (leaf.kind === "gold") applyReward(state, { gold: leaf.amount });
  else if (leaf.kind === "xp") grantXp(state, leaf.amount);
  else grantDuck(state, LEAVES.duckId);

  emit("leafClicked", { kind: leaf.kind, amount: leaf.amount, isCrit: leaf.isCrit });
  return true;
}
