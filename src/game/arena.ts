import { ARENA_BASE, ARENA_GROUPS, BASE_STATS, BOSS_ENEMY, ENEMY_TYPES } from "./balance";
import { attackDamageOf, attackSpeedOf, critChanceBonusOf, defenseOf, getDuckDef, hpOf, xpMultOf } from "./ducks";
import { emit } from "./events";
import { rollEquipmentDrop, rollMaterialDrop } from "./gear";
import { getStats, grantXp } from "./state";
import { registerHitResult } from "./streak";
import type { ArenaEnemy, ArenaState, GameState, OwnedDuck, Rng } from "./types";

export function isBossWave(wave: number): boolean {
  return wave % ARENA_BASE.bossInterval === 0;
}

// The enemy TYPE for a wave: bosses are always the pondlord; non-bosses cycle
// through ENEMY_TYPES by wave index (identity lives in game logic, C2).
export function enemyTypeForWave(wave: number): { id: string; name: string } {
  if (isBossWave(wave)) return BOSS_ENEMY;
  return ENEMY_TYPES[(wave - 1) % ENEMY_TYPES.length];
}

// HP of a single (solo) enemy at this wave, boss-scaled. Group members carry a
// fraction of this via ARENA_GROUPS.
export function enemyMaxHpAt(wave: number): number {
  const hp = ARENA_BASE.baseEnemyHp * Math.pow(ARENA_BASE.enemyHpGrowth, wave - 1);
  return hp * (isBossWave(wave) ? ARENA_BASE.bossHpMult : 1);
}

// Solo attack per enemy at this wave; group members deal a fraction (see
// enemyAttackFor).
export function enemyAttackAt(wave: number): number {
  return ARENA_BASE.baseEnemyAttack * Math.pow(ARENA_BASE.enemyAttackGrowth, wave - 1);
}

// How many enemies spawn for a wave (C2 feature 1): waves 1-9 always single;
// bosses always solo; otherwise wave%3==2 → 2, wave%3==0 → 3, else 1.
export function groupSizeForWave(wave: number): number {
  if (wave < ARENA_GROUPS.minGroupWave || isBossWave(wave)) return 1;
  if (wave % 3 === 2) return 2;
  if (wave % 3 === 0) return 3;
  return 1;
}

function perEnemyHpMult(size: number): number {
  if (size === 2) return ARENA_GROUPS.pairHpMult;
  if (size === 3) return ARENA_GROUPS.trioHpMult;
  return 1;
}

// Per-member attack: solo waves deal full attack, group members a fraction.
export function enemyAttackFor(wave: number): number {
  const solo = enemyAttackAt(wave);
  return groupSizeForWave(wave) > 1 ? solo * ARENA_GROUPS.groupAttackMult : solo;
}

export function xpPerKillAt(wave: number): number {
  return ARENA_BASE.xpPerKill * Math.pow(ARENA_BASE.xpPerKillGrowth, wave - 1);
}

function spawnEnemies(arena: ArenaState): void {
  const wave = arena.wave;
  const size = groupSizeForWave(wave);
  const soloHp = enemyMaxHpAt(wave);
  const hp = soloHp * perEnemyHpMult(size);
  const type = enemyTypeForWave(wave);
  const enemies: ArenaEnemy[] = [];
  for (let i = 0; i < size; i++) {
    enemies.push({ id: type.id, hp, maxHp: hp, nextHitIn: 1 / ARENA_BASE.enemyAttackSpeed });
  }
  arena.enemies = enemies;
}

function firstLivingEnemy(arena: ArenaState): ArenaEnemy | undefined {
  return arena.enemies.find((e) => e.hp > 0);
}

function allDead(arena: ArenaState): boolean {
  return arena.enemies.every((e) => e.hp <= 0);
}

function rosteredFighters(state: GameState): OwnedDuck[] {
  return state.rosters.arena
    .map((defId) => state.ducks.find((d) => d.defId === defId))
    .filter((d): d is OwnedDuck => !!d);
}

// Per-enemy death (C2 features 2 & 3): per-kill XP always, plus a one-time
// first-defeat bonus the first time this enemy TYPE is ever killed.
function onEnemyKilled(state: GameState, enemy: ArenaEnemy): void {
  const wave = state.arena.wave;
  const stats = getStats(state);
  const killXp = xpPerKillAt(wave) * stats.xpMult;
  grantXp(state, killXp);

  if (!state.arena.defeated.includes(enemy.id)) {
    state.arena.defeated.push(enemy.id);
    const bonus =
      (ARENA_BASE.firstDefeatXp + ARENA_BASE.firstDefeatKillMult * xpPerKillAt(wave)) *
      stats.xpMult;
    grantXp(state, bonus);
    const type = enemyTypeForWave(wave);
    const name = enemy.id === type.id ? type.name : enemy.id;
    emit("firstDefeat", { enemyId: enemy.id, name, xp: bonus });
  }
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
  rollMaterialDrop(state, rng, wave, boss);
  rollEquipmentDrop(state, rng, boss);
  if (boss) state.lifetime.bossesDefeated += 1;

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

  arena.teamMaxHp = fighters.reduce((sum, d) => sum + hpOf(state, d), 0);
  arena.teamHp = Math.min(arena.teamHp, arena.teamMaxHp);

  // Empty roster: the enemy idles and nothing progresses.
  if (fighters.length === 0) return;

  // Waiting out a between-wave pause or defeat retry (real time).
  if (arena.retryAt > 0) {
    if (nowMs < arena.retryAt) return;
    arena.retryAt = 0;
    arena.teamHp = arena.teamMaxHp; // heals to full between waves/retries
    spawnEnemies(arena);
  }
  if (arena.teamHp <= 0) arena.teamHp = arena.teamMaxHp; // fresh state bootstrap

  const boss = isBossWave(arena.wave);
  const enemyCritChance = boss ? ARENA_BASE.bossCritChance : ARENA_BASE.enemyCritChance;

  // Duck attacks — ducks auto-target the first living enemy.
  for (const duck of fighters) {
    let target = firstLivingEnemy(arena);
    if (!target) break;
    const def = getDuckDef(duck.defId);
    const hitsPerSec = attackSpeedOf(duck) * stats.attackSpeedMult * stats.arenaSpeedMult;
    if (hitsPerSec <= 0) continue;

    duck.nextHitIn -= dt;
    while (duck.nextHitIn <= 0) {
      duck.nextHitIn += 1 / hitsPerSec;

      target = firstLivingEnemy(arena);
      if (!target) break;

      const critChance = Math.min(
        Math.max(stats.critChance + critChanceBonusOf(state, duck), 0),
        BASE_STATS.critChanceCap,
      );
      const isCrit = rng.next() < critChance;
      const critMult = stats.critMult + def.critDamageBonus;

      const dmg =
        (attackDamageOf(state, duck) + stats.flatAttack) *
        stats.attackDamageMult *
        (isCrit ? critMult : 1);
      target.hp -= dmg;

      const xp = ARENA_BASE.xpPerHit * stats.xpMult * xpMultOf(duck);
      grantXp(state, xp);
      state.lifetime.hits += 1;
      if (isCrit) state.lifetime.crits += 1;
      registerHitResult(state, isCrit, nowMs, stats);
      emit("hit", { panel: "arena", duckId: duck.defId, isCrit, gold: 0, xp, ore: 0, dmg, targetId: target.id });

      if (target.hp <= 0) {
        onEnemyKilled(state, target);
        if (allDead(arena)) {
          victory(state, rng, nowMs);
          return;
        }
      }
    }
  }

  // Enemy attacks — each living enemy on its own timer.
  const teamDefense =
    (fighters.reduce((sum, d) => sum + defenseOf(state, d), 0) + stats.flatDefense) *
    stats.defenseMult;
  const enemyAttack = enemyAttackFor(arena.wave);

  for (const enemy of arena.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.nextHitIn -= dt;
    while (enemy.nextHitIn <= 0) {
      enemy.nextHitIn += 1 / ARENA_BASE.enemyAttackSpeed;
      const isCrit = rng.next() < enemyCritChance;
      const dmg = Math.max(1, enemyAttack - teamDefense) * (isCrit ? ARENA_BASE.enemyCritMult : 1);
      arena.teamHp -= dmg;
      emit("enemyhit", { dmg, isCrit });
      if (arena.teamHp <= 0) {
        defeat(state, nowMs);
        return;
      }
    }
  }
}
