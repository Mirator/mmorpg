import { describe, it, expect } from 'vitest';
import { MAP_CONFIG_VERSION, normalizeMapConfig, validateMapConfig } from './mapConfig.js';

function buildConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 100,
    base: { x: 0, z: 0, radius: 8 },
    spawnPoints: [{ x: 2, z: 2 }],
    obstacles: [{ x: -10, z: 5, radius: 4 }],
    resourceNodes: [{ id: 'r1', x: 8, z: -6 }],
    vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: -2 }],
    mobSpawns: [{ id: 'm1', x: 20, z: 10 }],
    ...overrides,
  };
}

describe('map config validation', () => {
  it('accepts a valid map config', () => {
    const config = buildConfig();
    expect(validateMapConfig(config)).toEqual([]);
  });

  it('rejects out-of-bounds positions', () => {
    const config = buildConfig({
      resourceNodes: [{ id: 'r1', x: 1000, z: 0 }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('resourceNodes[0]'))).toBe(true);
  });

  it('rejects duplicate ids', () => {
    const config = buildConfig({
      resourceNodes: [
        { id: 'r1', x: 1, z: 1 },
        { id: 'r1', x: 2, z: 2 },
      ],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('unique'))).toBe(true);
  });

  it('normalizes missing arrays', () => {
    const normalized = normalizeMapConfig({
      version: MAP_CONFIG_VERSION,
      mapSize: 50,
      base: { x: 0, z: 0, radius: 4 },
    });
    expect(normalized.spawnPoints).toEqual([]);
    expect(normalized.obstacles).toEqual([]);
    expect(normalized.resourceNodes).toEqual([]);
    expect(normalized.vendors).toEqual([]);
    expect(normalized.mobSpawns).toEqual([]);
  });

  it('normalizes points with y', () => {
    const normalized = normalizeMapConfig(buildConfig());
    expect(normalized.base).toHaveProperty('y', 0);
    expect(normalized.spawnPoints[0]).toHaveProperty('y', 0);
    expect(normalized.resourceNodes[0]).toHaveProperty('y', 0);
    const withY = normalizeMapConfig(
      buildConfig({
        spawnPoints: [{ x: 2, y: 5, z: 2 }],
      })
    );
    expect(withY.spawnPoints[0].y).toBe(5);
  });

  it('rejects y outside mapYMin/mapYMax when defined', () => {
    const config = buildConfig({
      mapYMin: -10,
      mapYMax: 10,
      spawnPoints: [{ x: 2, y: 20, z: 2 }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('y must be within'))).toBe(true);
  });
});
