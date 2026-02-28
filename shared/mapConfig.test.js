import { describe, it, expect } from 'vitest';
import { MAP_CONFIG_VERSION, normalizeMapConfig, validateMapConfig } from './mapConfig.js';

function buildConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 100,
    base: { x: 0, z: 0, radius: 8 },
    spawnPoints: [{ x: 2, z: 2 }],
    obstacles: [{ x: -10, z: 5, radius: 4 }],
    structures: [
      { id: 's1', kind: 'market', x: 15, z: 0, rotation: 1.57, colliderRadius: 3.6, collides: true },
    ],
    resourceNodes: [{ id: 'r1', x: 12, z: -8 }],
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

  it('rejects vendor/resource overlap unless allowOverlap is set', () => {
    const overlapping = buildConfig({
      resourceNodes: [{ id: 'r1', x: 7, z: -2 }],
    });
    const overlapErrors = validateMapConfig(overlapping);
    expect(overlapErrors.some((e) => e.includes('overlap usable radii'))).toBe(true);

    const whitelisted = buildConfig({
      resourceNodes: [{ id: 'r1', x: 7, z: -2, allowOverlap: true }],
    });
    expect(validateMapConfig(whitelisted)).toEqual([]);
  });

  it('rejects hostile mobs too close to vendors', () => {
    const config = buildConfig({
      mobSpawns: [{ id: 'm1', x: 8, z: -1, mobType: 'orc', aggressive: true }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('safe interaction space'))).toBe(true);
  });

  it('normalizes missing arrays', () => {
    const normalized = normalizeMapConfig({
      version: MAP_CONFIG_VERSION,
      mapSize: 50,
      base: { x: 0, z: 0, radius: 4 },
    });
    expect(normalized.spawnPoints).toEqual([]);
    expect(normalized.obstacles).toEqual([]);
    expect(normalized.structures).toEqual([]);
    expect(normalized.resourceNodes).toEqual([]);
    expect(normalized.vendors).toEqual([]);
    expect(normalized.mobSpawns).toEqual([]);
  });

  it('preserves allowOverlap markers when normalizing', () => {
    const normalized = normalizeMapConfig(buildConfig({
      resourceNodes: [{ id: 'r1', x: 12, z: -8, allowOverlap: true }],
      vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: -2, allowOverlap: true }],
      mobSpawns: [{ id: 'm1', x: 20, z: 10, allowOverlap: true }],
    }));
    expect(normalized.resourceNodes[0].allowOverlap).toBe(true);
    expect(normalized.vendors[0].allowOverlap).toBe(true);
    expect(normalized.mobSpawns[0].allowOverlap).toBe(true);
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

  it('rejects invalid structure kind', () => {
    const config = buildConfig({
      structures: [{ id: 's1', kind: 'castle', x: 0, z: 0, colliderRadius: 4 }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('structures[0] kind'))).toBe(true);
  });

  it('requires collider radius for collidable structures', () => {
    const config = buildConfig({
      structures: [{ id: 's1', kind: 'market', x: 0, z: 0, collides: true }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('colliderRadius'))).toBe(true);
  });

  it('requires unique structure ids', () => {
    const config = buildConfig({
      structures: [
        { id: 's1', kind: 'market', x: 10, z: 0, colliderRadius: 3 },
        { id: 's1', kind: 'houseA', x: -10, z: 0, colliderRadius: 3 },
      ],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('structures[1] id'))).toBe(true);
  });

  it('accepts fence structure kind', () => {
    const config = buildConfig({
      structures: [{ id: 'fence-1', kind: 'fence', x: 7, z: 4, colliderRadius: 1.8 }],
    });
    expect(validateMapConfig(config)).toEqual([]);
  });

  it('rejects out-of-bounds structure collider', () => {
    const config = buildConfig({
      mapSize: 40,
      structures: [{ id: 's1', kind: 'market', x: 19, z: 0, colliderRadius: 3 }],
    });
    const errors = validateMapConfig(config);
    expect(errors.some((e) => e.includes('collider must be within map bounds'))).toBe(true);
  });
});
