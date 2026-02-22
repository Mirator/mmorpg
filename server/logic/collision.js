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

export function applyCollisions(/** @type {any} */ pos, /** @type {any} */ world, /** @type {any} */ radius = 0) {
  const obstacles = Array.isArray(world?.collisionObstacles)
    ? world.collisionObstacles
    : world?.obstacles;
  const bounded = clampToBounds(pos, world.mapSize, radius, world);
  const resolved = resolveObstacles(bounded, obstacles, radius);
  return clampToBounds(resolved, world.mapSize, radius, world);
}
