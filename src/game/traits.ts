import type { TraitId } from "./types";

// Every multiplier applies to the OWNING duck's own effective stats only —
// no cross-duck team effects, keeping trait math local and easy to reason
// about (like level scaling). goldMult/xpMult apply to that duck's own hits.
export interface TraitEffect {
  miningMult?: number;
  attackMult?: number;
  attackSpeedMult?: number;
  defenseMult?: number;
  critChanceBonus?: number;
  xpMult?: number;
  goldMult?: number;
  hpMult?: number;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  desc: string;
  effect: TraitEffect;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  brave: { id: "brave", name: "Brave", desc: "+10% attack damage", effect: { attackMult: 1.1 } },
  cowardly: { id: "cowardly", name: "Cowardly", desc: "-10% attack damage, +15% action speed", effect: { attackMult: 0.9, attackSpeedMult: 1.15 } },
  intelligent: { id: "intelligent", name: "Intelligent", desc: "+15% XP from its own hits", effect: { xpMult: 1.15 } },
  efficient: { id: "efficient", name: "Efficient", desc: "+10% mining power", effect: { miningMult: 1.1 } },
  greedy: { id: "greedy", name: "Greedy", desc: "+10% gold from its mine hits, -5% XP", effect: { goldMult: 1.1, xpMult: 0.95 } },
  lazy: { id: "lazy", name: "Lazy", desc: "-10% action speed (boosts offline/pond contribution once available)", effect: { attackSpeedMult: 0.9 } },
  lucky: { id: "lucky", name: "Lucky", desc: "+3% crit chance", effect: { critChanceBonus: 0.03 } },
  loyal: { id: "loyal", name: "Loyal", desc: "+5% HP", effect: { hpMult: 1.05 } },
  energetic: { id: "energetic", name: "Energetic", desc: "+10% action speed, -5% damage", effect: { attackSpeedMult: 1.1, attackMult: 0.95 } },
  stoic: { id: "stoic", name: "Stoic", desc: "+15% defense", effect: { defenseMult: 1.15 } },
  curious: { id: "curious", name: "Curious", desc: "+10% expedition success chance (once expeditions arrive)", effect: {} },
  radiant: { id: "radiant", name: "Radiant", desc: "+5% to all its own stats (legendary+ only)", effect: { miningMult: 1.05, attackMult: 1.05, attackSpeedMult: 1.05, defenseMult: 1.05, critChanceBonus: 0.05, xpMult: 1.05, goldMult: 1.05, hpMult: 1.05 } },
};
