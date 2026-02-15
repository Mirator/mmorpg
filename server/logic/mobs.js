import { applyCollisions } from './collision.js';
import { MOB_MAX_LEVEL, clampMobLevel } from '../../shared/progression.js';
import { MOB_TYPES, getMobStats } from '../../shared/entityTypes.js';
import { computeDerivedStats } from '../../shared/attributes.js';

function randomRange(rand, min, max) {
  return min + (max - min) * rand();
}

function randomDirection(rand) {
  const angle = rand() * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

function distance2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const SPAWN_OFFSET_RADIUS = 0.5;
function getRespawnPos(spawnPos, rand) {
  const dx = (rand() * 2 - 1) * SPAWN_OFFSET_RADIUS;
  const dz = (rand() * 2 - 1) * SPAWN_OFFSET_RADIUS;
  return {
    x: spawnPos.x + dx,
    y: spawnPos.y ?? 0,
    z: spawnPos.z + dz,
  };
}

function isSpawnValid(x, z, world) {
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

export function getMobLevelForPosition(pos, world) {
  const maxDist = (world?.mapSize ?? 400) / 2;
  const base = world?.base ?? { x: 0, z: 0 };
  const dist = Math.hypot(pos.x - base.x, pos.z - base.z);
  const t = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;
  const level = 1 + Math.floor(t * (MOB_MAX_LEVEL - 1));
  return clampMobLevel(level);
}

export function getMobMaxHp(level, mobType) {
  const lvl = mobType === 'dummy' ? 1 : clampMobLevel(level);
  return mobType === 'dummy' ? 1 : 20 + 8 * lvl;
}

export function createMobs(count, world, options = {}) {
  const rand = options.random ?? Math.random;
  const mobs = [];
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
    const pos = { x, y: 0, z };
    mobs.push({
      id: `m${mobs.length + 1}`,
      pos: { ...pos },
      spawnPos: { ...pos },
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
      level,
      hp: maxHp,
      maxHp,
      dead: false,
      respawnAt: 0,
      mobType,
    });
  }

  if (mobs.length < count) {
    console.warn(
      `Mob spawn: placed ${mobs.length}/${count} mobs without overlap; ` +
        'map may be too dense for requested count.'
    );
  }

  return mobs;
}

function resolveMobLevel(spawn, pos, world, rand) {
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

export function createMobsFromSpawns(spawns, world, options = {}) {
  const rand = options.random ?? Math.random;
  const list = Array.isArray(spawns) ? spawns : [];
  return list.map((spawn, index) => {
    const x = spawn.x ?? 0;
    const z = spawn.z ?? 0;
    const pos = { x, y: spawn.y ?? 0, z };
    const level = resolveMobLevel(spawn, pos, world, rand);
    const mobType = spawn.mobType ?? 'orc';
    const maxHp = getMobMaxHp(level, mobType);
    const spawnPos = { x, y: pos.y, z };
    return {
      id: spawn.id ?? `m${index + 1}`,
      pos: { ...spawnPos },
      spawnPos,
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
      level,
      hp: maxHp,
      maxHp,
      dead: false,
      respawnAt: 0,
      mobType,
      aggressive: spawn.aggressive !== false,
    };
  });
}

export function stepMobs(mobs, players, world, dt, now, config = {}) {
  const rand = config.random ?? Math.random;
  const aggroRadius = config.aggroRadius ?? 12;
  const leashRadius = config.leashRadius ?? 18;
  const attackRange = config.attackRange ?? 1.4;
  const attackCooldownMs = config.attackCooldownMs ?? 900;
  const idleDuration = config.idleDurationMs ?? [1200, 2800];
  const wanderDuration = config.wanderDurationMs ?? [1500, 3200];

  const alivePlayers = players.filter((p) => !p.dead);

  for (const mob of mobs) {
    const isDummy = mob.mobType === 'dummy';
    const isPassive = mob.aggressive === false;
    if (isDummy) {
      if (mob.dead) {
        const stats = getMobStats('dummy');
        const respawnMs = config.respawnMs ?? stats.respawnMs;
        if (!mob.respawnAt) mob.respawnAt = now + respawnMs;
        if (now >= mob.respawnAt) {
          mob.dead = false;
          mob.hp = 1;
          mob.maxHp = 1;
          mob.respawnAt = 0;
          mob.state = 'idle';
          mob.targetId = null;
          if (mob.spawnPos) mob.pos = getRespawnPos(mob.spawnPos, rand);
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
          mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
          mob.damageBy = {};
          mob.supportBy = {};
          mob.tauntedUntil = 0;
          if (mob.spawnPos) mob.pos = getRespawnPos(mob.spawnPos, rand);
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
        mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
        mob.damageBy = {};
        mob.supportBy = {};
        mob.tauntedUntil = 0;
        if (mob.spawnPos) mob.pos = getRespawnPos(mob.spawnPos, rand);
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

    let target = null;
    if (!isPassive) {
      const taunted = (mob.tauntedUntil ?? 0) > now;
      if (taunted && mob.targetId) {
        const taunter = alivePlayers.find((p) => p.id === mob.targetId);
        if (taunter && distance2(taunter.pos, mob.pos) <= leashRadius * leashRadius) {
          target = taunter;
        }
      }
      if (!target) {
        let closestDist2 = aggroRadius * aggroRadius;
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
      mob.state = 'chase';
      mob.targetId = target.id;
    } else if (mob.state === 'chase') {
      mob.state = 'idle';
      mob.targetId = null;
      mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
    }

    if (mob.state === 'idle') {
      if (now >= mob.nextDecisionAt) {
        mob.state = 'wander';
        mob.dir = randomDirection(rand);
        mob.nextDecisionAt = now + randomRange(rand, ...wanderDuration);
      }
    } else if (mob.state === 'wander' && !rooted) {
      mob.pos.x += mob.dir.x * wanderSpeed * slowMultiplier * dt;
      mob.pos.z += mob.dir.z * wanderSpeed * slowMultiplier * dt;
      mob.pos = applyCollisions(mob.pos, world, mobRadius);
      if (now >= mob.nextDecisionAt) {
        mob.state = 'idle';
        mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
      }
    } else if (mob.state === 'chase' && target) {
      const dx = target.pos.x - mob.pos.x;
      const dz = target.pos.z - mob.pos.z;
      const dy = (target.pos.y ?? 0) - (mob.pos.y ?? 0);
      const dist = Math.hypot(dx, dz);
      if (dist > leashRadius) {
        mob.state = 'idle';
        mob.targetId = null;
        mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
      } else if (dist > 0.01 && !rooted) {
        const step = (speed * slowMultiplier * dt) / dist;
        mob.pos.x += dx * step;
        mob.pos.z += dz * step;
        mob.pos.y = (mob.pos.y ?? 0) + dy * Math.min(1, step);
        mob.pos = applyCollisions(mob.pos, world, mobRadius);
      } else {
        mob.pos.y = target.pos.y ?? 0;
      }

      if (dist <= attackRange && now >= mob.attackCooldownUntil) {
        let rawDamage =
          attackDamageBase + attackDamagePerLevel * (mob.level ?? 1);
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
        mob.attackCooldownUntil = now + attackCooldownMs;
      }
    }
  }
}
