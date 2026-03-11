// @ts-check
import { applyCollisions } from './collision.js';
import { logger } from '../logger.js';
import { MOB_MAX_LEVEL, clampMobLevel } from '../../shared/progression.js';
import { MOB_TYPES, getMobBehaviorType, getMobStats } from '../../shared/entityTypes.js';
import { computeDerivedStats } from '../../shared/attributes.js';

function randomRange(/** @type {any} */ rand, /** @type {any} */ min, /** @type {any} */ max) {
  return min + (max - min) * rand();
}

function randomDirection(/** @type {any} */ rand) {
  const angle = rand() * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function distance2(/** @type {any} */ a, /** @type {any} */ b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function clamp(/** @type {any} */ value, /** @type {any} */ min, /** @type {any} */ max) {
  return Math.max(min, Math.min(max, value));
}

const SPAWN_OFFSET_RADIUS = 0.5;
const TRAINING_DUMMY_MAX_HP = 999_999;

function getRespawnPos(/** @type {any} */ spawnPos, /** @type {any} */ rand) {
  const dx = (rand() * 2 - 1) * SPAWN_OFFSET_RADIUS;
  const dz = (rand() * 2 - 1) * SPAWN_OFFSET_RADIUS;
  return {
    x: spawnPos.x + dx,
    y: spawnPos.y ?? 0,
    z: spawnPos.z + dz,
  };
}

function isSpawnValid(/** @type {any} */ x, /** @type {any} */ z, /** @type {any} */ world) {
  const distFromBase = Math.hypot(x - world.base.x, z - world.base.z);
  if (distFromBase < world.base.radius + 8) return false;
  for (const obs of world.obstacles) {
    const dist = Math.hypot(x - obs.x, z - obs.z);
    if (dist < obs.r + 6) {
      return false;
    }
  }
  return true;
}

export function getMobLevelForPosition(/** @type {any} */ pos, /** @type {any} */ world) {
  const maxDist = (world?.mapSize ?? 400) / 2;
  const base = world?.base ?? { x: 0, z: 0 };
  const dist = Math.hypot(pos.x - base.x, pos.z - base.z);
  const t = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;
  const level = 1 + Math.floor(t * (MOB_MAX_LEVEL - 1));
  return clampMobLevel(level);
}

export function getMobMaxHp(/** @type {any} */ level, /** @type {any} */ mobType) {
  const lvl = mobType === 'dummy' ? 1 : clampMobLevel(level);
  return mobType === 'dummy' ? TRAINING_DUMMY_MAX_HP : 20 + 8 * lvl;
}

export function createMobs(/** @type {any} */ count, /** @type {any} */ world, /** @type {any} */ options = {}) {
  const rand = options.random ?? Math.random;
  const /** @type {any} */ mobs = [];
  const half = world.mapSize / 2 - 10;
  const maxTries = count * 60;
  let tries = 0;

  while (mobs.length < count && tries < maxTries) {
    tries += 1;
    const x = randomRange(rand, -half, half);
    const z = randomRange(rand, -half, half);
    if (!isSpawnValid(x, z, world)) continue;
    const level = getMobLevelForPosition({ x, z }, world);
    const mobType = MOB_TYPES[Math.floor(rand() * MOB_TYPES.length)];
    const maxHp = getMobMaxHp(level, mobType);
    const stats = getMobStats(mobType);
    const /** @type {any} */ pos = applyCollisions({ x, y: 0, z }, world, stats.radius ?? 0);
    mobs.push({
      id: `m${mobs.length + 1}`,
      pos: { ...pos },
      spawnPos: { ...pos },
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
      pendingAttackAt: 0,
      level,
      hp: maxHp,
      maxHp,
      dead: false,
      respawnAt: 0,
      mobType,
      tauntSourceId: null,
      tauntDamageDebuffUntil: 0,
      behaviorType: getMobBehaviorType(mobType),
      chargeWindupUntil: 0,
      chargeCooldownUntil: 0,
      chargeEmpoweredUntil: 0,
      ambushTriggered: false,
      ambushBonusUntil: 0,
      packLeaderBuffUntil: 0,
      healCooldownUntil: 0,
      skirmishBackstepUntil: 0,
    });
  }

  if (mobs.length < count) {
    logger.warn(
      `Mob spawn: placed ${mobs.length}/${count} mobs without overlap; ` +
        'map may be too dense for requested count.'
    );
  }

  return mobs;
}

function resolveMobLevel(/** @type {any} */ spawn, /** @type {any} */ pos, /** @type {any} */ world, /** @type {any} */ rand) {
  if (Number.isFinite(spawn.level)) {
    const base = clampMobLevel(spawn.level);
    const variance = Math.max(0, Math.floor(spawn.levelVariance ?? 0));
    if (variance > 0) {
      const offset = Math.floor(rand() * (2 * variance + 1)) - variance;
      return clampMobLevel(base + offset);
    }
    return base;
  }
  return getMobLevelForPosition(pos, world);
}

export function createMobsFromSpawns(/** @type {any} */ spawns, /** @type {any} */ world, /** @type {any} */ options = {}) {
  const rand = options.random ?? Math.random;
  const list = Array.isArray(spawns) ? spawns : [];
  return list.map((/** @type {any} */ spawn, /** @type {any} */ index) => {
    const x = spawn.x ?? 0;
    const z = spawn.z ?? 0;
    const /** @type {any} */ pos = { x, y: spawn.y ?? 0, z };
    const level = resolveMobLevel(spawn, pos, world, rand);
    const mobType = spawn.mobType ?? 'orc';
    const stats = getMobStats(mobType);
    const maxHp = getMobMaxHp(level, mobType);
    const /** @type {any} */ spawnPos = applyCollisions(
      { x, y: pos.y, z },
      world,
      stats.radius ?? 0
    );
    return {
      id: spawn.id ?? `m${index + 1}`,
      pos: { ...spawnPos },
      spawnPos,
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
      pendingAttackAt: 0,
      level,
      hp: maxHp,
      maxHp,
      dead: false,
      respawnAt: 0,
      mobType,
      aggressive: spawn.aggressive !== false,
      tauntSourceId: null,
      tauntDamageDebuffUntil: 0,
      behaviorType: getMobBehaviorType(mobType),
      chargeWindupUntil: 0,
      chargeCooldownUntil: 0,
      chargeEmpoweredUntil: 0,
      ambushTriggered: false,
      ambushBonusUntil: 0,
      packLeaderBuffUntil: 0,
      healCooldownUntil: 0,
      skirmishBackstepUntil: 0,
    };
  });
}

export function stepMobs(/** @type {any} */ mobs, /** @type {any} */ players, /** @type {any} */ world, /** @type {any} */ dt, /** @type {any} */ now, /** @type {any} */ config = {}) {
  const rand = config.random ?? Math.random;
  const aggroRadius = config.aggroRadius ?? 12;
  const leashRadius = config.leashRadius ?? 18;
  const attackRange = config.attackRange ?? 1.4;
  const attackCooldownMs = config.attackCooldownMs ?? 900;
  const attackTelegraphMs = typeof config.onAttackTelegraph === 'function'
    ? (config.attackTelegraphMs ?? 450)
    : 0;
  const idleDuration = config.idleDurationMs ?? [1200, 2800];
  const wanderDuration = config.wanderDurationMs ?? [1500, 3200];
  const idleMin = idleDuration[0] ?? 1200;
  const idleMax = idleDuration[1] ?? 2800;
  const wanderMin = wanderDuration[0] ?? 1500;
  const wanderMax = wanderDuration[1] ?? 3200;

  const alivePlayers = players.filter((/** @type {any} */ p) => !p.dead);

  for (const mob of mobs) {
    const isDummy = mob.mobType === 'dummy';
    const isPassive = mob.aggressive === false;
    if (isDummy) {
      const dummyMaxHp = getMobMaxHp(mob.level ?? 1, 'dummy');
      if (mob.maxHp !== dummyMaxHp) {
        const currentHp = Number.isFinite(mob.hp) ? mob.hp : dummyMaxHp;
        const previousMaxHp = Number.isFinite(mob.maxHp) && mob.maxHp > 0 ? mob.maxHp : currentHp;
        const hpRatio = previousMaxHp > 0 ? clamp(currentHp / previousMaxHp, 0, 1) : 1;
        mob.maxHp = dummyMaxHp;
        mob.hp = mob.dead ? 0 : Math.max(1, Math.round(dummyMaxHp * hpRatio));
      }
      if (mob.dead) {
        const stats = getMobStats('dummy');
        const dummyRadius = config.mobRadius ?? stats.radius ?? 0;
        const respawnMs = config.respawnMs ?? stats.respawnMs;
        if (!mob.respawnAt) mob.respawnAt = now + respawnMs;
        if (now >= mob.respawnAt) {
          mob.dead = false;
          mob.hp = dummyMaxHp;
          mob.maxHp = dummyMaxHp;
          mob.respawnAt = 0;
          mob.state = 'idle';
          mob.targetId = null;
          if (mob.spawnPos) {
            mob.pos = applyCollisions(getRespawnPos(mob.spawnPos, rand), world, dummyRadius);
          }
        }
      }
      continue;
    }
    const stats = getMobStats(mob.mobType);
    const speed = config.speed ?? stats.speed;
    const wanderSpeed = config.wanderSpeed ?? stats.wanderSpeed;
    const attackDamageBase = config.attackDamageBase ?? stats.attackDamageBase;
    const attackDamagePerLevel = config.attackDamagePerLevel ?? stats.attackDamagePerLevel;
    const mobRadius = config.mobRadius ?? stats.radius;
    const respawnMs = config.respawnMs ?? stats.respawnMs;

    if (mob.testId) {
      if (mob.dead) {
        if (!mob.respawnAt) {
          mob.respawnAt = now + respawnMs;
        }
        if (mob.respawnAt && now >= mob.respawnAt) {
          mob.dead = false;
          mob.hp = mob.maxHp ?? getMobMaxHp(mob.level ?? 1, mob.mobType);
          mob.state = 'idle';
          mob.targetId = null;
          mob.stunnedUntil = 0;
          mob.stunImmuneUntil = 0;
          mob.rootedUntil = 0;
          mob.slowUntil = 0;
          mob.slowMultiplier = 1;
          mob.weakenedUntil = 0;
          mob.weakenedMultiplier = 1;
          mob.attackCooldownUntil = 0;
          mob.pendingAttackAt = 0;
          mob.nextDecisionAt = now + randomRange(rand, idleMin, idleMax);
          mob.damageBy = {};
          mob.supportBy = {};
          mob.tauntedUntil = 0;
          mob.tauntSourceId = null;
          mob.tauntDamageDebuffUntil = 0;
          mob.chargeWindupUntil = 0;
          mob.chargeCooldownUntil = 0;
          mob.chargeEmpoweredUntil = 0;
          mob.ambushTriggered = false;
          mob.ambushBonusUntil = 0;
          mob.packLeaderBuffUntil = 0;
          mob.healCooldownUntil = 0;
          mob.skirmishBackstepUntil = 0;
          if (mob.spawnPos) {
            mob.pos = applyCollisions(getRespawnPos(mob.spawnPos, rand), world, mobRadius);
          }
        }
      }
      continue;
    }
    if (mob.dead) {
      if (!mob.respawnAt) {
        mob.respawnAt = now + respawnMs;
      }
      if (mob.respawnAt && now >= mob.respawnAt) {
        mob.dead = false;
        mob.hp = mob.maxHp ?? getMobMaxHp(mob.level ?? 1, mob.mobType);
        mob.state = 'idle';
        mob.targetId = null;
        mob.stunnedUntil = 0;
        mob.stunImmuneUntil = 0;
        mob.slowUntil = 0;
        mob.slowMultiplier = 1;
        mob.weakenedUntil = 0;
        mob.weakenedMultiplier = 1;
        mob.attackCooldownUntil = 0;
        mob.pendingAttackAt = 0;
        mob.nextDecisionAt = now + randomRange(rand, idleMin, idleMax);
        mob.damageBy = {};
        mob.supportBy = {};
        mob.tauntedUntil = 0;
        mob.tauntSourceId = null;
        mob.tauntDamageDebuffUntil = 0;
        mob.chargeWindupUntil = 0;
        mob.chargeCooldownUntil = 0;
        mob.chargeEmpoweredUntil = 0;
        mob.ambushTriggered = false;
        mob.ambushBonusUntil = 0;
        mob.packLeaderBuffUntil = 0;
        mob.healCooldownUntil = 0;
        mob.skirmishBackstepUntil = 0;
        if (mob.spawnPos) {
          mob.pos = applyCollisions(getRespawnPos(mob.spawnPos, rand), world, mobRadius);
        }
      }
      continue;
    }

    const stunned = Number.isFinite(mob.stunnedUntil) && mob.stunnedUntil > now;
    if (stunned) {
      continue;
    }

    const rooted = Number.isFinite(mob.rootedUntil) && mob.rootedUntil > now;

    const slowMultiplier =
      Number.isFinite(mob.slowUntil) && mob.slowUntil > now
        ? mob.slowMultiplier ?? 1
        : 1;
    const weakenedMultiplier =
      Number.isFinite(mob.weakenedUntil) && mob.weakenedUntil > now
        ? mob.weakenedMultiplier ?? 1
        : 1;
    const behaviorType = mob.behaviorType ?? getMobBehaviorType(mob.mobType);
    const hasPackLeaderBuff =
      behaviorType !== 'pack_leader' &&
      Number.isFinite(mob.packLeaderBuffUntil) &&
      mob.packLeaderBuffUntil > now;
    const moveBuffMultiplier = hasPackLeaderBuff ? 1.15 : 1;
    const damageBuffMultiplier = hasPackLeaderBuff ? 1.1 : 1;

    if (behaviorType === 'pack_leader') {
      for (const ally of mobs) {
        if (!ally || ally.id === mob.id || ally.dead) continue;
        const distToAlly = Math.hypot(
          (ally.pos?.x ?? 0) - (mob.pos?.x ?? 0),
          (ally.pos?.z ?? 0) - (mob.pos?.z ?? 0)
        );
        if (distToAlly <= 6) {
          ally.packLeaderBuffUntil = now + 1500;
        }
      }
    }

    if (behaviorType === 'healer' && now >= (mob.healCooldownUntil ?? 0)) {
      let /** @type {any} */ lowest = null;
      let lowestRatio = 1;
      for (const ally of mobs) {
        if (!ally || ally.dead || ally.id === mob.id) continue;
        const distToAlly = Math.hypot(
          (ally.pos?.x ?? 0) - (mob.pos?.x ?? 0),
          (ally.pos?.z ?? 0) - (mob.pos?.z ?? 0)
        );
        if (distToAlly > 8) continue;
        const ratio = (ally.hp ?? 0) / Math.max(1, ally.maxHp ?? 1);
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          lowest = ally;
        }
      }
      if (lowest) {
        const healAmount = 8 + 2 * (mob.level ?? 1);
        lowest.hp = Math.min(lowest.maxHp ?? lowest.hp ?? 0, (lowest.hp ?? 0) + healAmount);
        mob.healCooldownUntil = now + 6000;
      }
    }

    let /** @type {any} */ target = null;
    if (!isPassive) {
      const taunted = (mob.tauntedUntil ?? 0) > now;
      if (taunted && mob.targetId) {
        const taunter = alivePlayers.find((/** @type {any} */ p) => p.id === mob.targetId);
        if (taunter && distance2(taunter.pos, mob.pos) <= leashRadius * leashRadius) {
          target = taunter;
        }
      }
      if (!target) {
        const effectiveAggroRadius = behaviorType === 'ambusher' && !mob.ambushTriggered ? 4 : aggroRadius;
        let closestDist2 = effectiveAggroRadius * effectiveAggroRadius;
        for (const player of alivePlayers) {
          const dist2 = distance2(player.pos, mob.pos);
          if (dist2 <= closestDist2) {
            closestDist2 = dist2;
            target = player;
          }
        }
      }
    }

    if (target) {
      if (behaviorType === 'ambusher' && !mob.ambushTriggered) {
        mob.ambushTriggered = true;
        mob.ambushBonusUntil = now + 2000;
      }
      mob.state = 'chase';
      mob.targetId = target.id;
    } else if (mob.state === 'chase') {
      mob.state = 'idle';
      mob.targetId = null;
      mob.pendingAttackAt = 0;
      mob.nextDecisionAt = now + randomRange(rand, idleMin, idleMax);
    }

    if (mob.state === 'idle') {
      if (now >= mob.nextDecisionAt) {
        mob.state = 'wander';
        mob.dir = randomDirection(rand);
        mob.nextDecisionAt = now + randomRange(rand, wanderMin, wanderMax);
      }
    } else if (mob.state === 'wander' && !rooted) {
      mob.pos.x += mob.dir.x * wanderSpeed * slowMultiplier * dt;
      mob.pos.z += mob.dir.z * wanderSpeed * slowMultiplier * dt;
      mob.pos = applyCollisions(mob.pos, world, mobRadius);
      if (now >= mob.nextDecisionAt) {
        mob.state = 'idle';
        mob.nextDecisionAt = now + randomRange(rand, idleMin, idleMax);
      }
    } else if (mob.state === 'chase' && target) {
      const dx = target.pos.x - mob.pos.x;
      const dz = target.pos.z - mob.pos.z;
      const dy = (target.pos.y ?? 0) - (mob.pos.y ?? 0);
      const dist = Math.hypot(dx, dz);
      if (dist > leashRadius) {
        mob.state = 'idle';
        mob.targetId = null;
        mob.pendingAttackAt = 0;
        mob.nextDecisionAt = now + randomRange(rand, idleMin, idleMax);
      } else if (dist > 0.01 && !rooted) {
        let stepScale = speed * slowMultiplier * moveBuffMultiplier;
        if (
          behaviorType === 'charger' &&
          dist >= 4 &&
          dist <= 9 &&
          now >= (mob.chargeCooldownUntil ?? 0)
        ) {
          if (now < (mob.chargeWindupUntil ?? 0)) {
            stepScale = 0;
          } else if ((mob.chargeWindupUntil ?? 0) === 0) {
            mob.chargeWindupUntil = now + 500;
            stepScale = 0;
          } else {
            stepScale *= 2.2;
            mob.chargeCooldownUntil = now + 8000;
            mob.chargeWindupUntil = 0;
            mob.chargeEmpoweredUntil = now + 700;
          }
        } else if (behaviorType === 'skirmisher' && dist < 2) {
          mob.skirmishBackstepUntil = now + 700;
        }
        const moveAway = behaviorType === 'skirmisher' && (mob.skirmishBackstepUntil ?? 0) > now;
        const step = (stepScale * dt) / dist;
        const dirMult = moveAway ? -1 : 1;
        mob.pos.x += dx * step * dirMult;
        mob.pos.z += dz * step * dirMult;
        mob.pos.y = (mob.pos.y ?? 0) + dy * Math.min(1, step);
        mob.pos = applyCollisions(mob.pos, world, mobRadius);
      } else {
        mob.pos.y = target.pos.y ?? 0;
      }

      if (dist > attackRange && (mob.pendingAttackAt ?? 0) > 0) {
        mob.pendingAttackAt = 0;
      }

      if (
        attackTelegraphMs > 0 &&
        dist <= attackRange &&
        now >= mob.attackCooldownUntil &&
        (mob.pendingAttackAt ?? 0) === 0
      ) {
        mob.pendingAttackAt = now + attackTelegraphMs;
        const onAttackTelegraph = config.onAttackTelegraph;
        if (typeof onAttackTelegraph === 'function') {
          onAttackTelegraph(target, mob, attackTelegraphMs, now);
        }
        continue;
      }

      if (dist <= attackRange && (mob.pendingAttackAt ?? 0) > now) {
        continue;
      }

      if (
        dist <= attackRange &&
        now >= mob.attackCooldownUntil &&
        (attackTelegraphMs <= 0 || (mob.pendingAttackAt ?? 0) > 0)
      ) {
        let rawDamage =
          attackDamageBase + attackDamagePerLevel * (mob.level ?? 1);
        rawDamage *= damageBuffMultiplier;
        if ((mob.chargeEmpoweredUntil ?? 0) > now) {
          rawDamage *= 1.35;
          mob.chargeEmpoweredUntil = 0;
        }
        if ((mob.ambushBonusUntil ?? 0) > now) {
          rawDamage *= 1.25;
          mob.ambushBonusUntil = 0;
        }
        if ((mob.tauntDamageDebuffUntil ?? 0) > now && mob.targetId !== mob.tauntSourceId) {
          rawDamage *= 0.8;
        }
        rawDamage *= weakenedMultiplier;
        rawDamage *= target.damageTakenMultiplier ?? 1;
        const derived = computeDerivedStats(target);
        let finalDamage = Math.max(0, Math.floor(rawDamage * (100 / (100 + derived.physicalDefense))));
        const absorb = (target.absorbUntil ?? 0) > now ? (target.absorbAmount ?? 0) : 0;
        if (absorb > 0 && finalDamage > 0) {
          const toAbsorb = Math.min(finalDamage, absorb);
          target.absorbAmount = Math.max(0, (target.absorbAmount ?? 0) - toAbsorb);
          finalDamage -= toAbsorb;
          if ((target.absorbAmount ?? 0) <= 0) target.absorbUntil = 0;
        }
        target.hp = Math.max(0, target.hp - finalDamage);
        if (finalDamage > 0) {
          target.combatTagUntil = now + 5000;
          if (target.resourceType === 'rage') {
            const max = Number.isFinite(target.resourceMax) ? target.resourceMax : 100;
            target.resource = clamp((target.resource ?? 0) + 4, 0, max);
          }
          const onPlayerDamaged = config.onPlayerDamaged;
          if (typeof onPlayerDamaged === 'function') {
            onPlayerDamaged(target, mob, finalDamage, now);
          }
        }
        mob.pendingAttackAt = 0;
        mob.attackCooldownUntil = now + attackCooldownMs;
      }
    }
  }
}
