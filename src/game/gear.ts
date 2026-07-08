import { BOSS_MATERIAL, GEAR, MATERIAL_BY_WAVE_INDEX } from "./balance";
import { emit } from "./events";
import type { GameState, MaterialId, Rng } from "./types";

// Enemy-kill material drop: guaranteed on boss waves, chance otherwise,
// themed to the enemy family cycling with the wave (matches arena.ts's
// enemy name cycle). Equipment/crafting are removed (playtest X1) but
// materials keep accumulating silently for a future rework.
export function rollMaterialDrop(state: GameState, rng: Rng, wave: number, boss: boolean): MaterialId | null {
  if (boss) {
    state.materials[BOSS_MATERIAL] += 1;
    emit("materialDrop", { material: BOSS_MATERIAL });
    return BOSS_MATERIAL;
  }
  if (rng.next() >= GEAR.materialDropChance) return null;
  const material = MATERIAL_BY_WAVE_INDEX[(wave - 1) % MATERIAL_BY_WAVE_INDEX.length];
  state.materials[material] += 1;
  emit("materialDrop", { material });
  return material;
}
