// @ts-check
function clamp(/** @type {any} */ value, /** @type {any} */ min, /** @type {any} */ max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {{ x: number, y?: number, z: number }} pos
 * @param {number} mapSize
 * @param {number} [radius]
 * @param {{ mapYMin?: number, mapYMax?: number } | null} [world]
 */
export function clampToBounds(pos, mapSize, radius = 0, world = null) {
  const half = mapSize / 2 - radius;
  let y = pos.y ?? 0;
  if (world && Number.isFinite(world.mapYMin) && Number.isFinite(world.mapYMax)) {
    y = clamp(y, world.mapYMin, world.mapYMax);
  }
  return {
    x: clamp(pos.x, -half, half),
    y,
    z: clamp(pos.z, -half, half),
  };
}

export function resolveObstacles(/** @type {any} */ pos, /** @type {any} */ obstacles, /** @type {any} */ radius = 0) {
  const list = Array.isArray(obstacles) ? obstacles : [];
  let /** @type {any} */ out = { ...pos };
  for (const obs of list) {
    const dx = out.x - obs.x;
    const dz = out.z - obs.z;
    const dist = Math.hypot(dx, dz);
    const minDist = obs.r + radius;
    if (dist >= minDist) continue;

    if (dist === 0) {
      out.x = obs.x + minDist;
      out.z = obs.z;
      continue;
    }

    const push = minDist - dist;
    const nx = dx / dist;
    const nz = dz / dist;
    out.x += nx * push;
    out.z += nz * push;
  }

  return out;
}

function rotateToLocal(
  /** @type {number} */ dx,
  /** @type {number} */ dz,
  /** @type {number} */ rot
) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: dx * c + dz * s,
    z: -dx * s + dz * c,
  };
}

function rotateToWorld(
  /** @type {number} */ dx,
  /** @type {number} */ dz,
  /** @type {number} */ rot
) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: dx * c - dz * s,
    z: dx * s + dz * c,
  };
}

function resolveRectObstacles(
  /** @type {any} */ pos,
  /** @type {any} */ rects,
  /** @type {any} */ radius = 0
) {
  const list = Array.isArray(rects) ? rects : [];
  let /** @type {any} */ out = { ...pos };
  for (const rect of list) {
    const halfX = Number(rect?.halfX ?? 0);
    const halfZ = Number(rect?.halfZ ?? 0);
    if (!(halfX > 0) || !(halfZ > 0)) continue;

    const cx = Number(rect?.x ?? 0);
    const cz = Number(rect?.z ?? 0);
    const rot = Number(rect?.rotation ?? 0);
    const dx = out.x - cx;
    const dz = out.z - cz;
    const local = rotateToLocal(dx, dz, rot);
    const closestX = clamp(local.x, -halfX, halfX);
    const closestZ = clamp(local.z, -halfZ, halfZ);
    const offX = local.x - closestX;
    const offZ = local.z - closestZ;
    const distSq = offX * offX + offZ * offZ;

    if (distSq >= radius * radius) continue;

    let pushLocalX = 0;
    let pushLocalZ = 0;
    if (distSq > 0) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      pushLocalX = (offX / dist) * push;
      pushLocalZ = (offZ / dist) * push;
    } else {
      const toEdgeX = halfX - Math.abs(local.x);
      const toEdgeZ = halfZ - Math.abs(local.z);
      if (toEdgeX < toEdgeZ) {
        const sign = local.x >= 0 ? 1 : -1;
        pushLocalX = (toEdgeX + radius) * sign;
      } else {
        const sign = local.z >= 0 ? 1 : -1;
        pushLocalZ = (toEdgeZ + radius) * sign;
      }
    }

    const worldPush = rotateToWorld(pushLocalX, pushLocalZ, rot);
    out.x += worldPush.x;
    out.z += worldPush.z;
  }

  return out;
}

export function applyCollisions(/** @type {any} */ pos, /** @type {any} */ world, /** @type {any} */ radius = 0) {
  const circleObstacles = Array.isArray(world?.collisionObstacles)
    ? world.collisionObstacles
    : world?.obstacles;
  const rectObstacles = Array.isArray(world?.collisionRects)
    ? world.collisionRects
    : [];
  const bounded = clampToBounds(pos, world.mapSize, radius, world);
  const withCircles = resolveObstacles(bounded, circleObstacles, radius);
  const withRects = resolveRectObstacles(withCircles, rectObstacles, radius);
  const withCirclesSecondPass = resolveObstacles(withRects, circleObstacles, radius);
  const withRectsSecondPass = resolveRectObstacles(withCirclesSecondPass, rectObstacles, radius);
  return clampToBounds(withRectsSecondPass, world.mapSize, radius, world);
}
