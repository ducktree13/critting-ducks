import { ARENA_BASE, BASE_STATS, ENEMY_TYPES, LEVEL_REWARDS, ORE_LEVEL_GATES, PASSIVES, STARTING_GOLD, STREAK_BALANCE, XP_CURVE } from "./balance";
import { getDuckDef, makeOwnedDuck } from "./ducks";
import { emit } from "./events";
import { getSkillNode } from "./skilltree";
import type { DerivedStats, DuckDef, GameState, OreId, PackId, Panel, Reward } from "./types";

// Which duck roles may sit in which roster (PLAN2.md §4 Phase B). Hybrids
// can go anywhere; mine/arena/pond each also accept their matching
// specialist role. Expedition rosters stay role-free (expeditions.ts).
export function isRoleEligible(panel: Panel, role: DuckDef["role"]): boolean {
  if (role === "hybrid") return true;
  if (panel === "mine") return role === "miner";
  if (panel === "arena") return role === "fighter";
  return role === "pond";
}

export function createInitialState(): GameState {
  const now = Date.now();
  const ores: Record<OreId, number> = {
    copper: 0,
    silver: 0,
    crystal: 0,
    starmetal: 0,
    voidstone: 0,
    aurorium: 0,
  };
  return {
    version: 2,
    gold: STARTING_GOLD,
    xp: 0,
    level: 1,
    lifetime: {
      gold: 0,
      crits: 0,
      hits: 0,
      packs: 0,
      leavesClicked: 0,
      expeditionsCompleted: 0,
      gearCrafted: 0,
      bossesDefeated: 0,
      divinePulls: 0,
    },
    ores,
    selectedOre: "copper",
    ducks: [makeOwnedDuck("bill")],
    rosters: { mine: ["bill"], arena: [], pond: [] },
    skillNodes: [],
    shardPoints: 0,
    packCredits: { standard: 1, five: 0, pack25: 0, pack100: 0 }, // welcome pack
    unlockedDucks: [],
    materials: { slimeGoo: 0, gooseFeather: 0, golemCrumb: 0, sharkTooth: 0, pondlordRelic: 0 },
    equipment: [],
    achievementsCompleted: [],
    missions: { mine: [], tree: [], arena: [] },
    pinnedMission: { mine: null, tree: null, arena: null },
    tutorial: { step: 0, done: false, finaleGranted: false },
    streak: {
      current: 0,
      best: 0,
      buffExpiry: { t10: 0, t25: 0, t50: 0, t100: 0 },
      shieldReadyAt: 0,
    },
    arena: {
      wave: 1,
      enemies: [
        {
          id: ENEMY_TYPES[0].id,
          hp: ARENA_BASE.baseEnemyHp,
          maxHp: ARENA_BASE.baseEnemyHp,
          nextHitIn: 1 / ARENA_BASE.enemyAttackSpeed,
        },
      ],
      teamHp: 0,
      teamMaxHp: 0,
      retryAt: 0,
      defeated: [],
    },
    chapter: 1,
    leaves: [],
    nextLeafAt: 0,
    expeditions: [],
    settings: {
      darkMode: false,
      act2Tree: "mining2",
    },
    lastSaved: now,
    createdAt: now,
  };
}

export function xpToNext(level: number): number {
  return XP_CURVE.base * Math.pow(XP_CURVE.growth, level - 1);
}

// Adds XP and resolves level-ups (possibly several at once), granting the
// level rewards: scaling gold every level, a free pack every Nth level.
export function grantXp(state: GameState, amount: number): void {
  state.xp += amount;
  while (state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level += 1;

    const gold = LEVEL_REWARDS.goldPerLevel * state.level;
    state.gold += gold;
    state.lifetime.gold += gold;
    if (state.level % LEVEL_REWARDS.packEveryLevels === 0) {
      if ((LEVEL_REWARDS.fivePackLevels as readonly number[]).includes(state.level)) {
        state.packCredits.five += 1;
      } else {
        state.packCredits.standard += 1;
      }
    }

    emit("levelup", { level: state.level });
  }
}

// Assign an owned duck to a roster slot (or clear it with null). A duck can
// only be in one roster at a time, so assigning removes it from wherever it
// currently sits.
export function assignToRoster(
  state: GameState,
  panel: Panel,
  slotIndex: number,
  defId: string | null,
): boolean {
  const stats = getStats(state);
  const slots = panel === "mine" ? stats.mineSlots : panel === "arena" ? stats.arenaSlots : stats.pondSlots;
  if (slotIndex < 0 || slotIndex >= slots) return false;
  if (defId !== null && !state.ducks.some((d) => d.defId === defId)) return false;
  // Away on an expedition: not available to mine/arena/pond until it returns.
  if (defId !== null && state.expeditions.some((e) => e.ducks.includes(defId))) return false;
  // Role enforcement (PLAN2.md §4 Phase B): mine takes miner/hybrid, arena
  // takes fighter/hybrid, pond takes pond/hybrid.
  if (defId !== null && !isRoleEligible(panel, getDuckDef(defId).role)) return false;

  if (defId !== null) {
    for (const p of ["mine", "arena", "pond"] as const) {
      const i = state.rosters[p].indexOf(defId);
      if (i !== -1) state.rosters[p].splice(i, 1);
    }
  }

  const roster = state.rosters[panel];
  if (defId === null) {
    roster.splice(slotIndex, 1);
  } else if (slotIndex < roster.length) {
    roster[slotIndex] = defId;
  } else {
    roster.push(defId);
  }
  emit("roster", {});
  return true;
}

export function toggleFavorite(state: GameState, defId: string): void {
  const duck = state.ducks.find((d) => d.defId === defId);
  if (duck) duck.favorite = !duck.favorite;
}

// Applies a mission/achievement payout. Shared so both systems use the same
// reward shape and the same application logic.
export function applyReward(state: GameState, reward: Reward): void {
  if (reward.gold) {
    state.gold += reward.gold;
    state.lifetime.gold += reward.gold;
  }
  if (reward.shardPoints) state.shardPoints += reward.shardPoints;
  if (reward.packCredits) {
    for (const [pack, count] of Object.entries(reward.packCredits)) {
      state.packCredits[pack as PackId] += count ?? 0;
    }
  }
  if (reward.unlockDuck && !state.unlockedDucks.includes(reward.unlockDuck)) {
    state.unlockedDucks.push(reward.unlockDuck);
  }
}

// Aggregates base values, purchased skill nodes, rostered duck passives, and
// active streak buffs into one derived-stats snapshot. Skill nodes fold in
// when the tree lands in Phase 3.
export function computeStats(state: GameState, nowMs: number): DerivedStats {
  const stats: DerivedStats = {
    critChance: BASE_STATS.critChance,
    critMult: BASE_STATS.critMult,
    packCritChance: BASE_STATS.packCritChance,
    orePerHit: BASE_STATS.orePerHit,
    oreMult: 1,
    attackDamageMult: 1,
    flatAttack: 0,
    attackSpeedMult: 1,
    mineSpeedMult: 1,
    arenaSpeedMult: 1,
    defenseMult: 1,
    flatDefense: 0,
    xpMult: 1,
    goldMult: 1,
    mineSlots: BASE_STATS.mineSlots,
    arenaSlots: BASE_STATS.arenaSlots,
    pondSlots: BASE_STATS.pondSlots,
    offlineRate: BASE_STATS.offlineRate,
    buffDurationSec: BASE_STATS.buffDurationSec,
    unlockedOres: ["copper"],
  };

  // Purchased skill nodes fold in declaratively by effect kind. Ore unlock
  // nodes only take effect once the player also meets the ore's level gate.
  for (const id of state.skillNodes) {
    const effect = getSkillNode(id).effect;
    switch (effect.kind) {
      case "stat":
        if ("add" in effect) stats[effect.stat] += effect.add;
        else stats[effect.stat] *= effect.mult;
        break;
      case "slot":
        if (effect.panel === "mine") stats.mineSlots += 1;
        else if (effect.panel === "arena") stats.arenaSlots += 1;
        else stats.pondSlots += 1;
        break;
      case "oreUnlock":
        if (state.level >= ORE_LEVEL_GATES[effect.ore]) stats.unlockedOres.push(effect.ore);
        break;
      case "offline":
        stats.offlineRate = Math.max(stats.offlineRate, effect.rate);
        break;
      case "buffDuration":
        stats.buffDurationSec = effect.seconds;
        break;
      case "packCrit":
        stats.packCritChance += effect.add;
        break;
    }
  }

  // Team passives apply while the duck is rostered in the panel it affects.
  for (const defId of state.rosters.mine) {
    if (getDuckDef(defId).passive === "teamOre10") stats.oreMult *= PASSIVES.teamOreMult;
  }
  for (const defId of state.rosters.arena) {
    if (getDuckDef(defId).passive === "teamDmg10") stats.attackDamageMult *= PASSIVES.teamDmgMult;
  }

  // Pond auras apply globally while their duck sits in the pond roster
  // (PLAN2.md §4 Phase B): combat -> attack/defense, economy -> gold/xp.
  for (const defId of state.rosters.pond) {
    const aura = getDuckDef(defId).pondAura;
    if (!aura) continue;
    if (aura.kind === "combat") {
      stats.attackDamageMult *= 1 + aura.power;
      stats.defenseMult *= 1 + aura.power;
    } else {
      stats.goldMult *= 1 + aura.power;
      stats.xpMult *= 1 + aura.power;
    }
  }

  // Streak tier buffs, active while their real-time expiry is in the future.
  const expiry = state.streak.buffExpiry;
  if (nowMs < expiry.t10) stats.goldMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t25) stats.xpMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t50) stats.attackDamageMult *= STREAK_BALANCE.tierBuffMult;
  if (nowMs < expiry.t100) {
    stats.critChance += STREAK_BALANCE.quackeningCritBonus;
    stats.oreMult *= STREAK_BALANCE.quackeningMult;
    stats.attackDamageMult *= STREAK_BALANCE.quackeningMult;
    stats.attackSpeedMult *= STREAK_BALANCE.quackeningMult;
    stats.xpMult *= STREAK_BALANCE.quackeningMult;
    stats.goldMult *= STREAK_BALANCE.quackeningMult;
  }
  stats.critChance = Math.min(Math.max(stats.critChance, 0), BASE_STATS.critChanceCap);

  return stats;
}

// computeStats is called once per logic tick and cached here; the UI reads
// the same snapshot instead of recomputing per frame.
let cachedStats: DerivedStats | null = null;

export function refreshStats(state: GameState, nowMs: number): DerivedStats {
  cachedStats = computeStats(state, nowMs);
  return cachedStats;
}

export function getStats(state: GameState): DerivedStats {
  return cachedStats ?? refreshStats(state, Date.now());
}
