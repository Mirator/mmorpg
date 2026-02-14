import { describe, it, expect } from 'vitest';
import { createWorldFromConfig } from './world.js';

describe('world from map config', () => {
  it('preserves map layout', () => {
    const config = {
      version: 1,
      mapSize: 120,
      base: { x: 1, z: -2, radius: 7 },
      spawnPoints: [{ x: 3, z: 4 }],
      obstacles: [{ x: -10, z: 8, radius: 5 }],
      resourceNodes: [{ id: 'r1', x: 12, z: -6 }],
      vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: -2 }],
      mobSpawns: [{ id: 'm1', x: 18, z: 9 }],
    };

    const world = createWorldFromConfig(config);
    expect(world.mapSize).toBe(120);
    expect(world.base).toEqual({ x: 1, y: 0, z: -2, radius: 7 });
    expect(world.spawnPoints).toEqual([{ x: 3, y: 0, z: 4 }]);
    expect(world.obstacles).toEqual([{ x: -10, y: 0, z: 8, r: 5 }]);
    expect(world.resourceNodes).toEqual([{ id: 'r1', x: 12, y: 0, z: -6, type: 'crystal' }]);
    expect(world.vendors).toEqual([{ id: 'vendor-1', name: 'Vendor', x: 6, y: 0, z: -2 }]);
    expect(world.mobSpawns).toEqual([{ id: 'm1', x: 18, y: 0, z: 9 }]);
  });
});
