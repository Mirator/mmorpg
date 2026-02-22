import { describe, expect, it } from 'vitest';
import {
  PATCH_STATUS,
  applyZoneSnapshot,
  captureZoneSnapshot,
  createDefaultDesignerStateRoot,
  createDefaultZoneDesignerState,
  isValidPatchTransition,
  normalizeDesignerStateRoot,
  validateDesignerStateRoot,
} from './mapDesignerState.js';
import { MAP_CONFIG_VERSION } from './mapConfig.js';

function buildMapConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 100,
    base: { x: 0, z: 0, radius: 8 },
    spawnPoints: [{ x: 1, z: 1 }],
    obstacles: [],
    structures: [{ id: 's1', kind: 'market', x: 4, z: 0, colliderRadius: 3 }],
    resourceNodes: [{ id: 'r1', x: 4, z: 4 }],
    vendors: [{ id: 'vendor-1', name: 'Vendor', x: 3, z: 0 }],
    mobSpawns: [{ id: 'm1', x: -5, z: 7 }],
    ...overrides,
  };
}

describe('mapDesignerState shared model', () => {
  it('normalizes root and seeds default zone', () => {
    const normalized = normalizeDesignerStateRoot({ revision: 3, zones: {} });
    expect(normalized.revision).toBe(3);
    expect(normalized.zones['world-map']).toBeTruthy();
    expect(normalized.zones['world-map'].prefabs).toEqual([]);
  });

  it('captures and reapplies zone snapshots', () => {
    const zone = createDefaultZoneDesignerState();
    zone.prefabs.push({
      id: 'prefab-1',
      name: 'Test Prefab',
      entityType: 'structures',
      assetPath: '/assets/test.glb',
      tags: ['test'],
      defaults: { radius: 2 },
      version: 1,
      createdAt: '',
      updatedAt: '',
    });

    const snapshot = captureZoneSnapshot(zone);
    expect(snapshot.prefabs).toHaveLength(1);

    zone.prefabs = [];
    applyZoneSnapshot(zone, snapshot);
    expect(zone.prefabs).toHaveLength(1);
    expect(zone.prefabs[0].name).toBe('Test Prefab');
  });

  it('validates patch transition state machine', () => {
    expect(isValidPatchTransition(PATCH_STATUS.DRAFT, PATCH_STATUS.REVIEW_REQUESTED)).toBe(true);
    expect(isValidPatchTransition(PATCH_STATUS.REVIEW_REQUESTED, PATCH_STATUS.APPROVED)).toBe(true);
    expect(isValidPatchTransition(PATCH_STATUS.APPROVED, PATCH_STATUS.PUBLISHED)).toBe(true);
    expect(isValidPatchTransition(PATCH_STATUS.PUBLISHED, PATCH_STATUS.ROLLED_BACK)).toBe(true);
    expect(isValidPatchTransition(PATCH_STATUS.DRAFT, PATCH_STATUS.PUBLISHED)).toBe(false);
    expect(isValidPatchTransition(PATCH_STATUS.ROLLED_BACK, PATCH_STATUS.PUBLISHED)).toBe(false);
  });

  it('reports invalid prefab asset paths and patch dependencies', () => {
    const root = createDefaultDesignerStateRoot();
    const zone = root.zones['world-map'];

    zone.prefabs.push({
      id: 'prefab-1',
      name: 'Bad Prefab',
      entityType: 'structures',
      assetPath: 'assets/bad.glb',
      tags: [],
      defaults: {},
      version: 1,
      createdAt: '',
      updatedAt: '',
    });

    zone.patches.push({
      id: 'patch-1',
      title: 'Patch',
      description: '',
      dependencyIds: ['missing'],
      status: PATCH_STATUS.DRAFT,
      sourceSnapshot: {
        mapConfig: buildMapConfig(),
        zoneState: captureZoneSnapshot(zone),
      },
      publishedBaseline: null,
      createdAt: '',
      updatedAt: '',
      createdBy: 'admin',
      approvedAt: '',
      approvedBy: '',
      publishedAt: '',
      publishedBy: '',
      rolledBackAt: '',
      rolledBackBy: '',
      comments: [],
    });

    const errors = validateDesignerStateRoot(root);
    expect(errors.some((entry) => entry.includes('assetPath must start with /assets/'))).toBe(true);
    expect(errors.some((entry) => entry.includes('dependency'))).toBe(true);
  });
});
