import { describe, it, expect } from 'vitest';
import { clampToBounds, resolveObstacles, applyCollisions } from './collision.js';

describe('collision', () => {
  it('clamps positions to map bounds with radius', () => {
    const pos = { x: 10, y: 0, z: -10 };
    const clamped = clampToBounds(pos, 10, 1);
    expect(clamped.x).toBe(4);
    expect(clamped.y).toBe(0);
    expect(clamped.z).toBe(-4);
  });

  it('clamps y when world has mapYMin and mapYMax', () => {
    const pos = { x: 0, y: 50, z: 0 };
    const world = { mapSize: 20, mapYMin: -10, mapYMax: 10 };
    const clamped = clampToBounds(pos, 20, 0, world);
    expect(clamped.y).toBe(10);
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

  it('uses collisionObstacles when provided', () => {
    const world = {
      mapSize: 30,
      obstacles: [{ x: 10, z: 0, r: 1 }],
      collisionObstacles: [{ x: 0, z: 0, r: 4 }],
    };
    const pos = { x: 0.5, y: 0, z: 0 };
    const resolved = applyCollisions(pos, world, 0.6);
    expect(Math.hypot(resolved.x, resolved.z)).toBeGreaterThanOrEqual(4.6);
  });

  it('resolves combined rock and structure colliders', () => {
    const world = {
      mapSize: 60,
      collisionObstacles: [
        { x: -2, z: 0, r: 3 }, // rock
        { x: 2, z: 0, r: 3 }, // structure
      ],
    };
    const pos = { x: 0, y: 0, z: 0 };
    const resolved = applyCollisions(pos, world, 1);
    expect(Math.hypot(resolved.x + 2, resolved.z)).toBeGreaterThanOrEqual(4);
    expect(Math.hypot(resolved.x - 2, resolved.z)).toBeGreaterThanOrEqual(4);
  });
});
