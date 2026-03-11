import { describe, it, expect } from 'vitest';
import {
  MEDIEVAL_BUILDING_KIND_LIST,
  TILE_SIZE,
  buildMedievalStructureLayout,
  buildStructureCollisionRects,
  buildStructureInteriorBounds,
  getMedievalBuildingTemplate,
  pointInOrientedRect,
  transformPartPlacement,
} from './medievalBuildings.js';

const EXPECTED_PART_COUNTS = {
  houseA: 30,
  houseB: 35,
  market: 47,
  barracks: 40,
  storage: 41,
  bellTower: 19,
  villageCenter: 63,
};

const ROOF_FRONT_PART_KEYS = new Set(['roofFrontBrick6', 'roofFrontBrick8']);
const NON_TOWER_KINDS = MEDIEVAL_BUILDING_KIND_LIST.filter((kind) => kind !== 'bellTower');

describe('medievalBuildings', () => {
  it('returns templates for all migrated building kinds', () => {
    expect(MEDIEVAL_BUILDING_KIND_LIST).toEqual([
      'market',
      'barracks',
      'storage',
      'houseA',
      'houseB',
      'bellTower',
      'villageCenter',
    ]);
    for (const kind of MEDIEVAL_BUILDING_KIND_LIST) {
      const template = getMedievalBuildingTemplate(kind);
      expect(template).toBeTruthy();
      expect(template?.widthTiles).toBeGreaterThan(0);
      expect(template?.depthTiles).toBeGreaterThan(0);
      expect(Array.isArray(template?.openings)).toBe(true);
    }
  });

  it('generates deterministic local parts and collision rects for each template', () => {
    for (const kind of MEDIEVAL_BUILDING_KIND_LIST) {
      const layout = buildMedievalStructureLayout({ id: `${kind}-1`, kind, x: 0, y: 0, z: 0, rotation: 0 });
      expect(layout).toBeTruthy();
      expect(layout?.parts).toHaveLength(EXPECTED_PART_COUNTS[kind]);
      const roofParts = layout?.parts.filter((part) => part.role === 'roof') ?? [];
      expect(roofParts.length).toBe(kind === 'bellTower' ? 1 : 3);
      expect(layout?.localCollisionRects.length).toBeGreaterThan(0);
      expect(layout?.interiorBounds.halfX).toBeGreaterThan(0);
      expect(layout?.interiorBounds.halfZ).toBeGreaterThan(0);
    }
  });

  it('groups roof-end caps into the roof hide set for each non-tower template', () => {
    for (const kind of NON_TOWER_KINDS) {
      const layout = buildMedievalStructureLayout({ id: `${kind}-roof`, kind, x: 0, y: 0, z: 0, rotation: 0 });
      const roofParts = layout?.parts.filter((part) => part.role === 'roof') ?? [];
      expect(roofParts.length).toBe(3);
      const roofFrontParts = layout?.parts.filter((part) => ROOF_FRONT_PART_KEYS.has(part.partKey)) ?? [];
      expect(roofFrontParts.length).toBe(2);
      expect(roofFrontParts.every((part) => part.role === 'roof')).toBe(true);
    }
  });

  it('transforms local part placements into world space with rotation', () => {
    const sample = {
      partKey: 'floorBrick',
      role: 'floor',
      x: TILE_SIZE,
      y: 0,
      z: 0,
      rotation: 0,
    };
    const transformed = transformPartPlacement(sample, {
      x: 10,
      y: 1,
      z: -2,
      rotation: Math.PI / 2,
    });

    expect(transformed.x).toBeCloseTo(10, 3);
    expect(transformed.z).toBeCloseTo(0, 3);
    expect(transformed.y).toBe(1);
    expect(transformed.rotation).toBeCloseTo(Math.PI / 2, 3);
  });

  it('returns world collision rects with structure id metadata', () => {
    const rects = buildStructureCollisionRects({
      id: 's-market',
      kind: 'market',
      x: 8,
      z: -4,
      rotation: 0.75,
    });
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.every((rect) => rect.structureId === 's-market')).toBe(true);
    expect(rects.every((rect) => rect.kind === 'market')).toBe(true);
  });

  it('exposes interior bounds usable for roof hide checks', () => {
    const bounds = buildStructureInteriorBounds({
      id: 's-house-a',
      kind: 'houseA',
      x: 0,
      z: 0,
      rotation: 0,
    });

    expect(bounds).toBeTruthy();
    expect(pointInOrientedRect({ x: 0, z: 0 }, bounds)).toBe(true);
    expect(pointInOrientedRect({ x: 20, z: 20 }, bounds)).toBe(false);
  });
});
