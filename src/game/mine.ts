import { BASE_STATS, MINE_XP_PER_HIT, ORE_VALUES, PASSIVES } from "./balance";
import { getDuckDef, miningPowerOf } from "./ducks";
import { emit } from "./events";
import { getStats, grantXp } from "./state";
import { registerHitResult } from "./streak";
import type { GameState, Rng } from "./types";

export function tickMine(state: GameState, dt: number, rng: Rng): void {
  const stats = getStats(state);
  const goldenCritRostered = state.rosters.mine.some(
    (defId) => getDuckDef(defId).passive === "goldenCrit",
  );

  for (const defId of state.rosters.mine) {
    const duck = state.ducks.find((d) => d.defId === defId);
    if (!duck) continue;
    const def = getDuckDef(defId);

    const hitsPerSec = def.attacksPerSecond * stats.attackSpeedMult * stats.mineSpeedMult;
    if (hitsPerSec <= 0) continue;

    duck.nextHitIn -= dt;
    while (duck.nextHitIn <= 0) {
      duck.nextHitIn += 1 / hitsPerSec;

      const critChance = Math.min(
        Math.max(stats.critChance + def.critChanceBonus, 0),
        BASE_STATS.critChanceCap,
      );
      const isCrit = rng.next() < critChance;
      const critMult = stats.critMult + def.critDamageBonus;

      const ore =
        (stats.orePerHit + miningPowerOf(duck)) * stats.oreMult * (isCrit ? critMult : 1);
      let gold = ore * ORE_VALUES[state.selectedOre] * stats.goldMult;
      if (isCrit && goldenCritRostered) gold *= PASSIVES.goldenCritGoldMult;
      const xp = MINE_XP_PER_HIT * stats.xpMult;

      state.gold += gold;
      state.lifetime.gold += gold;
      state.ores[state.selectedOre] += ore;
      state.lifetime.hits += 1;
      if (isCrit) state.lifetime.crits += 1;
      grantXp(state, xp);
      registerHitResult(state, isCrit, Date.now(), stats);

      emit("hit", { panel: "mine", duckId: defId, isCrit, gold, xp, ore });
    }
  }
}
