import { ARENA_BASE, BASE_STATS } from "./balance";
import { attackDamageOf, attackSpeedOf, critChanceBonusOf, defenseOf, getDuckDef, hpOf, xpMultOf } from "./ducks";
import { emit } from "./events";
import { getStats, grantXp } from "./state";
import { registerHitResult } from "./streak";
import type { ArenaState, GameState, OwnedDuck, Rng } from "./types";

export function isBossWave(wave: number): boolean {
  return wave % ARENA_BASE.bossInterval === 0;
}

export function enemyMaxHpAt(wave: number): number {
  const hp = ARENA_BASE.baseEnemyHp * Math.pow(ARENA_BASE.enemyHpGrowth, wave - 1);
  return hp * (isBossWave(wave) ? ARENA_BASE.bossHpMult : 1);
}

export function enemyAttackAt(wave: number): number {
  return ARENA_BASE.baseEnemyAttack * Math.pow(ARENA_BASE.enemyAttackGrowth, wave - 1);
}

function spawnEnemy(arena: ArenaState): void {
  arena.enemyMaxHp = enemyMaxHpAt(arena.wave);
  arena.enemyHp = arena.enemyMaxHp;
  arena.enemyNextHitIn = 1 / ARENA_BASE.enemyAttackSpeed;
}

function rosteredFighters(state: GameState): OwnedDuck[] {
  return state.rosters.arena
    .map((defId) => state.ducks.find((d) => d.defId === defId))
    .filter((d): d is OwnedDuck => !!d);
}

function victory(state: GameState, rng: Rng, nowMs: number): void {
  const stats = getStats(state);
  const arena = state.arena;
  const wave = arena.wave;
  const boss = isBossWave(wave);
  const rewardMult = boss ? ARENA_BASE.bossRewardMult : 1;

  const gold =
    ARENA_BASE.baseGoldReward * Math.pow(ARENA_BASE.goldRewardGrowth, wave - 1) *
    stats.goldMult * rewardMult;
  const xp =
    ARENA_BASE.baseXpReward * Math.pow(ARENA_BASE.xpRewardGrowth, wave - 1) *
    stats.xpMult * rewardMult;
  state.gold += gold;
  state.lifetime.gold += gold;
  grantXp(state, xp);

  const fighters = rosteredFighters(state);
  if (fighters.length > 0 && (boss || rng.next() < ARENA_BASE.shardChance)) {
    const lucky = fighters[Math.min(Math.floor(rng.next() * fighters.length), fighters.length - 1)];
    lucky.shards += 1;
  }

  emit("wave", { wave, boss, gold, xp });
  arena.wave += 1;
  arena.retryAt = nowMs + ARENA_BASE.nextWaveDelaySec * 1000;
}

function defeat(state: GameState, nowMs: number): void {
  state.arena.retryAt = nowMs + ARENA_BASE.retrySec * 1000;
}

export function tickArena(state: GameState, dt: number, rng: Rng): void {
  const stats = getStats(state);
  const arena = state.arena;
  const fighters = rosteredFighters(state);
  const nowMs = Date.now();

  arena.teamMaxHp = fighters.reduce((sum, d) => sum + hpOf(d), 0);
  arena.teamHp = Math.min(arena.teamHp, arena.teamMaxHp);

  // Empty roster: the enemy idles and nothing progresses.
  if (fighters.length === 0) return;

  // Waiting out a between-wave pause or defeat retry (real time).
  if (arena.retryAt > 0) {
    if (nowMs < arena.retryAt) return;
    arena.retryAt = 0;
    arena.teamHp = arena.teamMaxHp; // heals to full between waves/retries
    spawnEnemy(arena);
  }
  if (arena.teamHp <= 0) arena.teamHp = arena.teamMaxHp; // fresh state bootstrap

  // Duck attacks.
  for (const duck of fighters) {
    if (arena.enemyHp <= 0) break;
    const def = getDuckDef(duck.defId);
    const hitsPerSec = attackSpeedOf(duck) * stats.attackSpeedMult * stats.arenaSpeedMult;
    if (hitsPerSec <= 0) continue;

    duck.nextHitIn -= dt;
    while (duck.nextHitIn <= 0) {
      duck.nextHitIn += 1 / hitsPerSec;

      const critChance = Math.min(
        Math.max(stats.critChance + critChanceBonusOf(duck), 0),
        BASE_STATS.critChanceCap,
      );
      const isCrit = rng.next() < critChance;
      const critMult = stats.critMult + def.critDamageBonus;

      const dmg =
        (attackDamageOf(duck) + stats.flatAttack) *
        stats.attackDamageMult *
        (isCrit ? critMult : 1);
      arena.enemyHp -= dmg;

      const xp = ARENA_BASE.xpPerHit * stats.xpMult * xpMultOf(duck);
      grantXp(state, xp);
      state.lifetime.hits += 1;
      if (isCrit) state.lifetime.crits += 1;
      registerHitResult(state, isCrit, nowMs, stats);
      emit("hit", { panel: "arena", duckId: duck.defId, isCrit, gold: 0, xp, ore: 0, dmg });

      if (arena.enemyHp <= 0) {
        victory(state, rng, nowMs);
        return;
      }
    }
  }

  // Enemy attacks.
  const teamDefense =
    (fighters.reduce((sum, d) => sum + defenseOf(d), 0) + stats.flatDefense) *
    stats.defenseMult;
  const enemyAttack = enemyAttackAt(arena.wave);

  arena.enemyNextHitIn -= dt;
  while (arena.enemyNextHitIn <= 0) {
    arena.enemyNextHitIn += 1 / ARENA_BASE.enemyAttackSpeed;
    const dmg = Math.max(1, enemyAttack - teamDefense);
    arena.teamHp -= dmg;
    emit("enemyhit", { dmg });
    if (arena.teamHp <= 0) {
      defeat(state, nowMs);
      return;
    }
  }
}
