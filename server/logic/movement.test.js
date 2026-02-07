import { describe, it, expect } from 'vitest';
import { applyWASD, stepTowardTarget, stepPlayer } from './movement.js';

describe('movement', () => {
  it('normalizes diagonal WASD input', () => {
    const dir = applyWASD({ w: true, d: true });
    expect(dir.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(dir.z).toBeCloseTo(-Math.SQRT1_2, 5);
  });

  it('moves with WASD at configured speed', () => {
    const state = { pos: { x: 0, y: 0, z: 0 }, target: null };
    const result = stepPlayer(state, { keys: { d: true } }, 1, { speed: 3 });
    expect(result.pos.x).toBeCloseTo(3, 5);
    expect(result.pos.z).toBeCloseTo(0, 5);
  });

  it('moves toward target and clears when within epsilon', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const target = { x: 2, z: 0 };
    const result = stepTowardTarget(pos, target, 1, 3, 0.1);
    expect(result.pos.x).toBeCloseTo(2, 5);
    expect(result.target).toBeNull();
  });

  it('moves toward target without clearing when not reached', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const target = { x: 10, z: 0 };
    const result = stepTowardTarget(pos, target, 1, 2, 0.1);
    expect(result.pos.x).toBeCloseTo(2, 5);
    expect(result.target).toEqual(target);
  });

  it('WASD clears target', () => {
    const state = { pos: { x: 0, y: 0, z: 0 }, target: { x: 10, z: 0 } };
    const result = stepPlayer(state, { keys: { w: true } }, 1, { speed: 1 });
    expect(result.pos.z).toBeCloseTo(-1, 5);
    expect(result.target).toBeNull();
  });

  it('no input and no target yields no movement', () => {
    const state = { pos: { x: 1, y: 0, z: -2 }, target: null };
    const result = stepPlayer(state, { keys: {} }, 1, { speed: 5 });
    expect(result.pos).toEqual({ x: 1, y: 0, z: -2 });
  });
});
