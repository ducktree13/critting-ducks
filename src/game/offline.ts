import { BASE_STATS, MINE_XP_PER_HIT, OFFLINE, ORE_VALUES } from "./balance";
import { getDuckDef, miningPowerOf } from "./ducks";
import { grantXp } from "./state";
import type { DerivedStats, GameState } from "./types";

export interface OfflineReport {
  elapsedSec: number;
  cappedSec: number;
  rate: number;
  goldGained: number;
  xpGained: number;
  levelsGained: number;
}

// Expected mine income per second from the current mine roster, without
// streak buffs (pass stats computed with buffs expired). Crits contribute
// their expected value: 1 + critChance * (critMult - 1).
export function offlineIncomePerSec(
  state: GameState,
  stats: DerivedStats,
): { goldPerSec: number; xpPerSec: number } {
  let goldPerSec = 0;
  let xpPerSec = 0;
  for (const defId of state.rosters.mine) {
    const duck = state.ducks.find((d) => d.defId === defId);
    if (!duck) continue;
    const def = getDuckDef(defId);
    const hitsPerSec = def.attacksPerSecond * stats.attackSpeedMult * stats.mineSpeedMult;
    const critChance = Math.min(
      Math.max(stats.critChance + def.critChanceBonus, 0),
      BASE_STATS.critChanceCap,
    );
    const critMult = stats.critMult + def.critDamageBonus;
    const expectedCrit = 1 + critChance * (critMult - 1);
    const orePerHit = (stats.orePerHit + miningPowerOf(duck)) * stats.oreMult;
    goldPerSec +=
      hitsPerSec * orePerHit * ORE_VALUES[state.selectedOre] * stats.goldMult * expectedCrit;
    xpPerSec += hitsPerSec * MINE_XP_PER_HIT * stats.xpMult;
  }
  return { goldPerSec, xpPerSec };
}

// Grants capped offline earnings at the given stats' offline rate and
// returns a report for the Welcome Back modal. Arena does not progress.
export function computeOfflineProgress(
  state: GameState,
  elapsedSec: number,
  stats: DerivedStats,
): OfflineReport {
  const cappedSec = Math.min(elapsedSec, OFFLINE.capSec);
  const rate = stats.offlineRate;
  const { goldPerSec, xpPerSec } = offlineIncomePerSec(state, stats);

  const goldGained = goldPerSec * cappedSec * rate;
  const xpGained = xpPerSec * cappedSec * rate;
  const levelBefore = state.level;

  state.gold += goldGained;
  state.lifetime.gold += goldGained;
  grantXp(state, xpGained);

  return {
    elapsedSec,
    cappedSec,
    rate,
    goldGained,
    xpGained,
    levelsGained: state.level - levelBefore,
  };
}
