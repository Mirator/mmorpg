import { applyCollisions } from './collision.js';
import { MAX_LEVEL } from '../../shared/progression.js';
import { MOB_CONFIG } from '../../shared/config.js';

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

function clampLevel(level) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
}

export function getMobLevelForPosition(pos, world) {
  const maxDist = (world?.mapSize ?? 400) / 2;
  const base = world?.base ?? { x: 0, z: 0 };
  const dist = Math.hypot(pos.x - base.x, pos.z - base.z);
  const t = maxDist > 0 ? Math.min(1, dist / maxDist) : 0;
  const level = 1 + Math.floor(t * (MAX_LEVEL - 1));
  return clampLevel(level);
}

export function getMobMaxHp(level) {
  const lvl = clampLevel(level);
  return 20 + 8 * lvl;
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
    const maxHp = getMobMaxHp(level);
    mobs.push({
      id: `m${mobs.length + 1}`,
      pos: { x, y: 0, z },
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

export function createMobsFromSpawns(spawns, world, options = {}) {
  const rand = options.random ?? Math.random;
  const list = Array.isArray(spawns) ? spawns : [];
  return list.map((spawn, index) => {
    const x = spawn.x ?? 0;
    const z = spawn.z ?? 0;
    const level = getMobLevelForPosition({ x, z }, world);
    const maxHp = getMobMaxHp(level);
    const y = spawn.y ?? 0;
    return {
      id: spawn.id ?? `m${index + 1}`,
      pos: { x, y, z },
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
    };
  });
}

export function stepMobs(mobs, players, world, dt, now, config = {}) {
  const rand = config.random ?? Math.random;
  const speed = config.speed ?? 2.2;
  const wanderSpeed = config.wanderSpeed ?? 1.4;
  const aggroRadius = config.aggroRadius ?? 12;
  const leashRadius = config.leashRadius ?? 18;
  const attackRange = config.attackRange ?? 1.4;
  const attackDamageBase = config.attackDamageBase ?? MOB_CONFIG.attackDamageBase;
  const attackDamagePerLevel = config.attackDamagePerLevel ?? MOB_CONFIG.attackDamagePerLevel;
  const attackCooldownMs = config.attackCooldownMs ?? 900;
  const idleDuration = config.idleDurationMs ?? [1200, 2800];
  const wanderDuration = config.wanderDurationMs ?? [1500, 3200];
  const mobRadius = config.mobRadius ?? MOB_CONFIG.radius;
  const respawnMs = config.respawnMs ?? MOB_CONFIG.respawnMs;

  const alivePlayers = players.filter((p) => !p.dead);

  for (const mob of mobs) {
    if (mob.testId) {
      if (mob.dead) {
        if (!mob.respawnAt) {
          mob.respawnAt = now + respawnMs;
        }
        if (mob.respawnAt && now >= mob.respawnAt) {
          mob.dead = false;
          mob.hp = mob.maxHp ?? getMobMaxHp(mob.level ?? 1);
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
        mob.hp = mob.maxHp ?? getMobMaxHp(mob.level ?? 1);
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
      }
      continue;
    }

    const stunned = Number.isFinite(mob.stunnedUntil) && mob.stunnedUntil > now;
    if (stunned) {
      continue;
    }

    const slowMultiplier =
      Number.isFinite(mob.slowUntil) && mob.slowUntil > now
        ? mob.slowMultiplier ?? 1
        : 1;
    const weakenedMultiplier =
      Number.isFinite(mob.weakenedUntil) && mob.weakenedUntil > now
        ? mob.weakenedMultiplier ?? 1
        : 1;

    let target = null;
    let closestDist2 = aggroRadius * aggroRadius;
    for (const player of alivePlayers) {
      const dist2 = distance2(player.pos, mob.pos);
      if (dist2 <= closestDist2) {
        closestDist2 = dist2;
        target = player;
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
    } else if (mob.state === 'wander') {
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
      } else if (dist > 0.01) {
        const step = (speed * slowMultiplier * dt) / dist;
        mob.pos.x += dx * step;
        mob.pos.z += dz * step;
        mob.pos.y = (mob.pos.y ?? 0) + dy * Math.min(1, step);
        mob.pos = applyCollisions(mob.pos, world, mobRadius);
      } else {
        mob.pos.y = target.pos.y ?? 0;
      }

      if (dist <= attackRange && now >= mob.attackCooldownUntil) {
        let damage =
          attackDamageBase + attackDamagePerLevel * (mob.level ?? 1);
        damage *= weakenedMultiplier;
        damage *= target.damageTakenMultiplier ?? 1;
        damage = Math.max(0, Math.floor(damage));
        target.hp = Math.max(0, target.hp - damage);
        if (damage > 0) {
          target.combatTagUntil = now + 5000;
          if (target.resourceType === 'rage') {
            const max = Number.isFinite(target.resourceMax) ? target.resourceMax : 100;
            target.resource = clamp((target.resource ?? 0) + 4, 0, max);
          }
        }
        mob.attackCooldownUntil = now + attackCooldownMs;
      }
    }
  }
}
