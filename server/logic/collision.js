function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clampToBounds(pos, mapSize, radius = 0) {
  const half = mapSize / 2 - radius;
  return {
    x: clamp(pos.x, -half, half),
    y: pos.y ?? 0,
    z: clamp(pos.z, -half, half),
  };
}

export function resolveObstacles(pos, obstacles, radius = 0) {
  let out = { ...pos };
  for (const obs of obstacles) {
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

export function applyCollisions(pos, world, radius = 0) {
  const bounded = clampToBounds(pos, world.mapSize, radius);
  const resolved = resolveObstacles(bounded, world.obstacles, radius);
  return clampToBounds(resolved, world.mapSize, radius);
}
