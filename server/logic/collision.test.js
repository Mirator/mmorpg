import { describe, it, expect } from 'vitest';
import { clampToBounds, resolveObstacles, applyCollisions } from './collision.js';

describe('collision', () => {
  it('clamps positions to map bounds with radius', () => {
    const pos = { x: 10, y: 0, z: -10 };
    const clamped = clampToBounds(pos, 10, 1);
    expect(clamped.x).toBe(4);
    expect(clamped.z).toBe(-4);
  });

  it('pushes out of obstacles', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const obstacles = [{ x: 0, z: 0, r: 2 }];
    const resolved = resolveObstacles(pos, obstacles, 1);
    const dist = Math.hypot(resolved.x, resolved.z);
    expect(dist).toBeGreaterThanOrEqual(3);
  });

  it('applies bounds and obstacles together', () => {
    const world = {
      mapSize: 20,
      obstacles: [{ x: 5, z: 0, r: 2 }],
    };
    const pos = { x: 7, y: 0, z: 0 };
    const resolved = applyCollisions(pos, world, 1);
    expect(resolved.x).toBeLessThanOrEqual(9);
    expect(Math.hypot(resolved.x - 5, resolved.z)).toBeGreaterThanOrEqual(3);
  });
});
