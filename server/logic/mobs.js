import { applyCollisions } from './collision.js';

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

export function createMobs(count, world, options = {}) {
  const rand = options.random ?? Math.random;
  const mobs = [];
  const half = world.mapSize / 2 - 10;
  const maxTries = count * 30;
  let tries = 0;

  while (mobs.length < count && tries < maxTries) {
    tries += 1;
    const x = randomRange(rand, -half, half);
    const z = randomRange(rand, -half, half);
    const distFromBase = Math.hypot(x - world.base.x, z - world.base.z);
    if (distFromBase < world.base.radius + 8) continue;
    let blocked = false;
    for (const obs of world.obstacles) {
      const dist = Math.hypot(x - obs.x, z - obs.z);
      if (dist < obs.r + 6) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    mobs.push({
      id: `m${mobs.length + 1}`,
      pos: { x, y: 0, z },
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
    });
  }

  while (mobs.length < count) {
    const x = randomRange(rand, -half, half);
    const z = randomRange(rand, -half, half);
    mobs.push({
      id: `m${mobs.length + 1}`,
      pos: { x, y: 0, z },
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: randomDirection(rand),
      attackCooldownUntil: 0,
    });
  }

  return mobs;
}

export function stepMobs(mobs, players, world, dt, now, config = {}) {
  const rand = config.random ?? Math.random;
  const speed = config.speed ?? 2.2;
  const wanderSpeed = config.wanderSpeed ?? 1.4;
  const aggroRadius = config.aggroRadius ?? 12;
  const leashRadius = config.leashRadius ?? 18;
  const attackRange = config.attackRange ?? 1.4;
  const attackDamage = config.attackDamage ?? 8;
  const attackCooldownMs = config.attackCooldownMs ?? 900;
  const idleDuration = config.idleDurationMs ?? [1200, 2800];
  const wanderDuration = config.wanderDurationMs ?? [1500, 3200];
  const mobRadius = config.mobRadius ?? 0.8;

  const alivePlayers = players.filter((p) => !p.dead);

  for (const mob of mobs) {
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
      mob.pos.x += mob.dir.x * wanderSpeed * dt;
      mob.pos.z += mob.dir.z * wanderSpeed * dt;
      mob.pos = applyCollisions(mob.pos, world, mobRadius);
      if (now >= mob.nextDecisionAt) {
        mob.state = 'idle';
        mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
      }
    } else if (mob.state === 'chase' && target) {
      const dx = target.pos.x - mob.pos.x;
      const dz = target.pos.z - mob.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > leashRadius) {
        mob.state = 'idle';
        mob.targetId = null;
        mob.nextDecisionAt = now + randomRange(rand, ...idleDuration);
      } else if (dist > 0.01) {
        mob.pos.x += (dx / dist) * speed * dt;
        mob.pos.z += (dz / dist) * speed * dt;
        mob.pos = applyCollisions(mob.pos, world, mobRadius);
      }

      if (dist <= attackRange && now >= mob.attackCooldownUntil) {
        target.hp = Math.max(0, target.hp - attackDamage);
        mob.attackCooldownUntil = now + attackCooldownMs;
      }
    }
  }
}
