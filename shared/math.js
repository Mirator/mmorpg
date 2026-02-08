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
