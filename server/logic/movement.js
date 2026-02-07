export function normalize2(x, z) {
  const len = Math.hypot(x, z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

export function applyWASD(keys = {}) {
  // Match camera-facing movement so "W" moves up on screen.
  // Camera is fixed at (20, 20, 20) looking at (0, 0, 0),
  // so forward on the ground plane is (-1, -1) and right is (1, -1).
  const forward = normalize2(-1, -1);
  const right = normalize2(1, -1);

  let x = 0;
  let z = 0;

  if (keys.w) {
    x += forward.x;
    z += forward.z;
  }
  if (keys.s) {
    x -= forward.x;
    z -= forward.z;
  }
  if (keys.d) {
    x += right.x;
    z += right.z;
  }
  if (keys.a) {
    x -= right.x;
    z -= right.z;
  }

  return normalize2(x, z);
}

export function stepTowardTarget(pos, target, dt, speed, epsilon = 0.1) {
  if (!target) return { pos: { ...pos }, target: null };

  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= epsilon) {
    return {
      pos: { x: target.x, y: pos.y ?? 0, z: target.z },
      target: null,
    };
  }

  const step = speed * dt;
  if (step >= dist) {
    return {
      pos: { x: target.x, y: pos.y ?? 0, z: target.z },
      target: null,
    };
  }

  const nx = dx / dist;
  const nz = dz / dist;

  return {
    pos: {
      x: pos.x + nx * step,
      y: pos.y ?? 0,
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
