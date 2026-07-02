import { PASSIVES, STREAK_BALANCE } from "./balance";
import { getDuckDef } from "./ducks";
import type { DerivedStats, GameState } from "./types";

// Streak speed multiplier: continuous, capped at 2.0x. Scales game-time only;
// buff expiry and autosave run on real time.
export function gameSpeed(state: GameState): number {
  return (
    1 +
    STREAK_BALANCE.speedPerCrit *
      Math.min(state.streak.current, STREAK_BALANCE.speedCap)
  );
}

function shieldRostered(state: GameState): boolean {
  const rostered = [...state.rosters.mine, ...state.rosters.arena];
  return rostered.some((defId) => getDuckDef(defId).passive === "streakShield");
}

// Every resolved duck attack (mine or arena) feeds this one global counter.
// Crossing a tier starts its buff; every further crit at/above refreshes it.
// A non-crit resets the streak (unless the Streak Shield eats it) but never
// touches buff expiries — they run out on their own timers.
export function registerHitResult(
  state: GameState,
  isCrit: boolean,
  nowMs: number,
  stats: DerivedStats,
): void {
  const s = state.streak;

  if (isCrit) {
    s.current += 1;
    if (s.current > s.best) s.best = s.current;
    const expiry = nowMs + stats.buffDurationSec * 1000;
    if (s.current >= STREAK_BALANCE.tiers.t10) s.buffExpiry.t10 = expiry;
    if (s.current >= STREAK_BALANCE.tiers.t25) s.buffExpiry.t25 = expiry;
    if (s.current >= STREAK_BALANCE.tiers.t50) s.buffExpiry.t50 = expiry;
    if (s.current >= STREAK_BALANCE.tiers.t100) s.buffExpiry.t100 = expiry;
    return;
  }

  if (shieldRostered(state) && nowMs >= s.shieldReadyAt) {
    s.shieldReadyAt = nowMs + PASSIVES.streakShieldCooldownMs;
    return;
  }
  s.current = 0;
}
