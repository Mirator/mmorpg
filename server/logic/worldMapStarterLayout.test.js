import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeMapConfig, validateMapConfig } from '../../shared/mapConfig.js';

const MAP_PATH = path.resolve(process.cwd(), 'server', 'data', 'world-map.json');
const TILE_SPLIT = 400 / 6; // 66.666...
const TILES = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'];

const EXPECTED_TILE_BUDGETS = {
  C: { resources: 8, mobs: 2, structures: 16, obstacles: 3, vendors: 3 },
  N: { resources: 7, mobs: 4, structures: 5, obstacles: 3, vendors: 0 },
  S: { resources: 6, mobs: 6, structures: 6, obstacles: 4, vendors: 0 },
  W: { resources: 6, mobs: 6, structures: 5, obstacles: 4, vendors: 0 },
  E: { resources: 5, mobs: 6, structures: 6, obstacles: 4, vendors: 0 },
  NW: { resources: 6, mobs: 4, structures: 3, obstacles: 4, vendors: 0 },
  NE: { resources: 5, mobs: 4, structures: 3, obstacles: 4, vendors: 0 },
  SW: { resources: 6, mobs: 2, structures: 5, obstacles: 4, vendors: 1 },
  SE: { resources: 5, mobs: 6, structures: 4, obstacles: 4, vendors: 0 },
};

function loadMap() {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));
  return normalizeMapConfig(raw);
}

function tileOf(x, z) {
  const col = x < -TILE_SPLIT ? 0 : x > TILE_SPLIT ? 2 : 1;
  const row = z > TILE_SPLIT ? 0 : z < -TILE_SPLIT ? 2 : 1;
  return [
    ['NW', 'N', 'NE'],
    ['W', 'C', 'E'],
    ['SW', 'S', 'SE'],
  ][row][col];
}

function countByTile(list) {
  const counts = Object.fromEntries(TILES.map((tile) => [tile, 0]));
  for (const entry of list) {
    counts[tileOf(entry.x, entry.z)] += 1;
  }
  return counts;
}

function distance2d(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

describe('starter world full-map layout', () => {
  it('loads and validates the map config', () => {
    const map = loadMap();
    const errors = validateMapConfig(map);
    expect(errors).toEqual([]);

    expect(map.mapSize).toBe(400);
    expect(map.base).toMatchObject({ x: 0, y: 0, z: 0, radius: 16 });
    expect(map.spawnPoints).toHaveLength(6);
  });

  it('matches exact district budgets', () => {
    const map = loadMap();

    const counts = {
      resources: countByTile(map.resourceNodes),
      mobs: countByTile(map.mobSpawns),
      structures: countByTile(map.structures),
      obstacles: countByTile(map.obstacles),
      vendors: countByTile(map.vendors),
    };

    for (const tile of TILES) {
      const budget = EXPECTED_TILE_BUDGETS[tile];
      expect(counts.resources[tile]).toBe(budget.resources);
      expect(counts.mobs[tile]).toBe(budget.mobs);
      expect(counts.structures[tile]).toBe(budget.structures);
      expect(counts.obstacles[tile]).toBe(budget.obstacles);
      expect(counts.vendors[tile]).toBe(budget.vendors);
    }

    expect(map.resourceNodes).toHaveLength(54);
    expect(map.mobSpawns).toHaveLength(40);
    expect(map.structures).toHaveLength(53);
    expect(map.obstacles).toHaveLength(34);
    expect(map.vendors).toHaveLength(4);
  });

  it('keeps all districts non-empty in interactable density', () => {
    const map = loadMap();

    const resources = countByTile(map.resourceNodes);
    const mobs = countByTile(map.mobSpawns);
    const structures = countByTile(map.structures);
    const obstacles = countByTile(map.obstacles);

    for (const tile of TILES) {
      const interactables =
        resources[tile] + mobs[tile] + structures[tile] + obstacles[tile];
      expect(interactables).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps H-corridors clear of colliders', () => {
    const map = loadMap();
    const colliders = [
      ...map.obstacles.map((obs) => ({ x: obs.x, z: obs.z, r: obs.radius ?? obs.r ?? 0 })),
      ...map.structures
        .filter((structure) => structure.collides !== false)
        .map((structure) => ({ x: structure.x, z: structure.z, r: structure.colliderRadius ?? 0 })),
    ];

    for (const collider of colliders) {
      const intersectsVertical = Math.abs(collider.x) - collider.r < 12;
      const intersectsHorizontal = Math.abs(collider.z) - collider.r < 12;
      expect(intersectsVertical || intersectsHorizontal).toBe(false);
    }
  });

  it('enforces starter mob constraints', () => {
    const map = loadMap();
    const disallowed = new Set(['demon', 'yeti']);

    for (const mob of map.mobSpawns) {
      expect(disallowed.has(mob.mobType)).toBe(false);
      expect(mob.level).toBeGreaterThanOrEqual(1);
      expect(mob.level).toBeLessThanOrEqual(5);

      const isAggressiveNonDummy = mob.mobType !== 'dummy' && mob.aggressive !== false;
      if (isAggressiveNonDummy) {
        const dist = distance2d({ x: mob.x, z: mob.z }, map.base);
        expect(dist).toBeGreaterThanOrEqual(28);
      }
    }
  });
});
