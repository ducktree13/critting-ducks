import { BUBBLES } from "./balance";
import { emit } from "./events";
import { grantDuck } from "./packs";
import { applyReward, grantXp } from "./state";
import type { DerivedStats, GameState, Rng } from "./types";

let nextBubbleId = 1;

function scheduleNextBubble(state: GameState, nowMs: number, rng: Rng): void {
  const gap = BUBBLES.minGapMs + rng.next() * (BUBBLES.maxGapMs - BUBBLES.minGapMs);
  state.nextBubbleAt = nowMs + gap;
}

function spawnBubble(state: GameState, nowMs: number, rng: Rng, stats: DerivedStats): void {
  const isCrit = rng.next() < stats.critChance;
  const isDuckTree = rng.next() < BUBBLES.duckTreeChance;
  const kind = isDuckTree ? "duck" : rng.next() < 0.5 ? "gold" : "xp";
  const base = kind === "gold" ? BUBBLES.goldPerLevel * state.level : BUBBLES.xpPerLevel * state.level;
  const amount = kind === "duck" ? 0 : Math.round(base * (isCrit ? BUBBLES.critMult : 1));

  state.bubbles.push({
    id: `bubble${nextBubbleId++}`,
    spawnedAt: nowMs,
    expiresAt: nowMs + BUBBLES.expiresAfterMs,
    kind,
    amount,
    isCrit,
  });
}

// The pond is core from chapter 1 onward, so bubbles surface regardless of
// chapter (unlike the Act-2-only falling leaves this replaces). Real-time
// driven (not scaled by the streak's gameSpeed), so call with wall-clock
// Date.now().
export function tickBubbles(state: GameState, nowMs: number, rng: Rng, stats: DerivedStats): void {
  state.bubbles = state.bubbles.filter((b) => b.expiresAt > nowMs);
  if (nowMs < state.nextBubbleAt) return;
  if (state.bubbles.length === 0) spawnBubble(state, nowMs, rng, stats);
  scheduleNextBubble(state, nowMs, rng);
}

// Applies the bubble's reward and removes it. Returns false if it already
// expired or was already popped.
export function popBubble(state: GameState, bubbleId: string): boolean {
  const bubble = state.bubbles.find((b) => b.id === bubbleId);
  if (!bubble) return false;
  state.bubbles = state.bubbles.filter((b) => b.id !== bubbleId);

  if (bubble.kind === "gold") applyReward(state, { gold: bubble.amount });
  else if (bubble.kind === "xp") grantXp(state, bubble.amount);
  else grantDuck(state, BUBBLES.duckId);

  state.lifetime.bubblesPopped += 1;
  emit("bubblePopped", { kind: bubble.kind, amount: bubble.amount, isCrit: bubble.isCrit });
  return true;
}
