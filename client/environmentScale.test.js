import { describe, expect, it } from 'vitest';
import {
  CHARACTER_HEIGHT,
  computeEnvironmentScale,
  ENV_SCALE_OVERRIDES,
  ENV_SCALE_PROFILE,
  ENV_SCALE_TARGETS,
} from './environmentScale.js';

describe('environmentScale', () => {
  it('computes gameplay-readable house scale from model bounds', () => {
    const result = computeEnvironmentScale({
      key: 'houseA',
      category: 'house',
      modelBounds: { x: 2, y: 2, z: 2 },
      baseRadius: 9,
      profile: ENV_SCALE_PROFILE,
    });

    expect(result.valid).toBe(true);
    expect(result.targetHeight).toBeCloseTo(ENV_SCALE_TARGETS.gameplayReadable.houseHeight, 6);
    expect(result.uniformScale).toBeCloseTo(2.8, 6);
    expect(result.effectiveHeight).toBeCloseTo(5.6, 6);
  });

  it('applies storage override so windmill scales above base mill category', () => {
    const result = computeEnvironmentScale({
      key: 'storage',
      category: 'mill',
      modelBounds: { x: 2, y: 2, z: 2 },
      baseRadius: 9,
      profile: ENV_SCALE_PROFILE,
    });
    const house = computeEnvironmentScale({
      key: 'houseA',
      category: 'house',
      modelBounds: { x: 2, y: 2, z: 2 },
      baseRadius: 9,
      profile: ENV_SCALE_PROFILE,
    });

    expect(result.targetHeight).toBeCloseTo(7.2 * ENV_SCALE_OVERRIDES.storage.uniformMultiplier, 6);
    expect(result.effectiveHeight).toBeGreaterThan(house.effectiveHeight);
    expect(result.scale.y).toBeCloseTo(result.scale.x, 6);
  });

  it('shrinks village center uniformly and keeps vertical override', () => {
    const base = computeEnvironmentScale({
      key: 'villageCenterBase',
      category: 'villageCenter',
      modelBounds: { x: 8, y: 3, z: 8 },
      baseRadius: 9,
      profile: ENV_SCALE_PROFILE,
    });
    const withOverride = computeEnvironmentScale({
      key: 'villageCenterModel',
      category: 'villageCenter',
      modelBounds: { x: 8, y: 3, z: 8 },
      baseRadius: 9,
      profile: ENV_SCALE_PROFILE,
    });

    expect(CHARACTER_HEIGHT).toBe(2.0);
    expect(withOverride.targetHeight).toBeCloseTo(base.targetHeight * 0.5, 6);
    expect(withOverride.uniformScale).toBeCloseTo(base.uniformScale * 0.5, 6);
    expect(withOverride.yScaleMultiplier).toBeCloseTo(0.82, 6);
    expect(withOverride.effectiveHeight).toBeLessThan(base.effectiveHeight);
    expect(withOverride.effectiveHeight).toBeCloseTo(base.effectiveHeight * 0.5 * 0.82, 6);
  });
});
