import { applyWASD } from '../../shared/math.js';

export { applyWASD };

export function stepTowardTarget(pos, target, dt, speed, epsilon = 0.1) {
  if (!target) return { pos: { ...pos }, target: null };

  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);

  const targetY = target.y ?? pos.y ?? 0;
  if (dist <= epsilon) {
    return {
      pos: { x: target.x, y: targetY, z: target.z },
      target: null,
    };
  }

  const step = speed * dt;
  if (step >= dist) {
    return {
      pos: { x: target.x, y: targetY, z: target.z },
      target: null,
    };
  }

  const nx = dx / dist;
  const nz = dz / dist;
  const lerp = step / dist;
  const y = (pos.y ?? 0) + (targetY - (pos.y ?? 0)) * lerp;

  return {
    pos: {
      x: pos.x + nx * step,
      y,
      z: pos.z + nz * step,
    },
    target,
  };
}

export function stepPlayer(state, input, dt, config = {}) {
  const speed = config.speed ?? 3;
  const epsilon = config.targetEpsilon ?? 0.1;
  const pos = {
    x: state.pos.x,
    y: state.pos.y ?? 0,
    z: state.pos.z,
  };
  const target = state.target ?? null;
  const dir = applyWASD(input?.keys ?? {});

  if (dir.x !== 0 || dir.z !== 0) {
    return {
      pos: {
        x: pos.x + dir.x * speed * dt,
        y: pos.y,
        z: pos.z + dir.z * speed * dt,
      },
      target: null,
    };
  }

  if (target) {
    return stepTowardTarget(pos, target, dt, speed, epsilon);
  }

  return { pos, target };
}
