import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_CONFIG_VERSION } from '../shared/mapConfig.js';
import { PATCH_STATUS } from '../shared/mapDesignerState.js';
import { createMapDesignerStateStore, loadDesignerStateSync } from './mapDesignerState.js';

function buildMapConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 90,
    base: { x: 0, z: 0, radius: 8 },
    spawnPoints: [{ x: 2, z: 2 }],
    obstacles: [],
    structures: [{ id: 's1', kind: 'market', x: 8, z: 0, colliderRadius: 3 }],
    resourceNodes: [{ id: 'r1', x: 5, z: 7 }],
    vendors: [{ id: 'vendor-1', name: 'Vendor', x: 4, z: 0 }],
    mobSpawns: [{ id: 'm1', x: -7, z: 6 }],
    ...overrides,
  };
}

function makeStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'designer-state-'));
  const mapPath = path.join(tmpDir, 'world-map.json');
  const designerPath = path.join(tmpDir, 'world-map.designer.json');
  fs.writeFileSync(mapPath, JSON.stringify(buildMapConfig(), null, 2), 'utf8');
  const store = createMapDesignerStateStore({
    mapConfigPath: mapPath,
    designerStatePath: designerPath,
  });
  return {
    tmpDir,
    mapPath,
    designerPath,
    store,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('mapDesignerState store', () => {
  it('returns revision conflict when expectedRevision is stale', () => {
    const { store } = makeStore();
    const initial = store.getState('world-map');

    const nextZone = {
      ...initial.zoneState,
      navAreas: [
        {
          id: 'nav-1',
          name: 'Road',
          shape: 'circle',
          x: 2,
          y: 0,
          z: 3,
          radius: 6,
          width: 10,
          height: 10,
          walkCost: 1,
          runCost: 0.8,
          tags: ['road'],
        },
      ],
    };

    const saved = store.putState('world-map', initial.revision, nextZone, 'alice');
    expect(saved.revision).toBe(initial.revision + 1);

    try {
      store.putState('world-map', initial.revision, nextZone, 'alice');
      throw new Error('Expected revision conflict to throw');
    } catch (err) {
      const error = /** @type {Error & { status?: number, revision?: number }} */ (err);
      expect(error.status).toBe(409);
      expect(error.revision).toBe(saved.revision);
    }
  });

  it('enforces strict lock ownership for layer mutations', () => {
    const { store } = makeStore();

    store.setLayerLock('world-map', 'props', { action: 'acquire', reason: 'editing props' }, 'alice');

    expect(() =>
      store.createPrefab(
        'world-map',
        {
          name: 'Market Prefab',
          entityType: 'structures',
          assetPath: '/assets/models/market.glb',
          tags: ['market'],
          defaults: {},
        },
        'bob'
      )
    ).toThrow(/Layer props lock held by alice/);

    expect(() =>
      store.setLayerLock('world-map', 'props', { action: 'release' }, 'bob')
    ).toThrow(/can only be released by alice/);

    store.setLayerLock('world-map', 'props', { action: 'release' }, 'alice');
    const prefab = store.createPrefab(
      'world-map',
      {
        name: 'Market Prefab',
        entityType: 'structures',
        assetPath: '/assets/models/market.glb',
        tags: ['market'],
        defaults: {},
      },
      'bob'
    );

    expect(prefab.id).toContain('prefab-');
  });

  it('rejects oversized patch titles and comment text', () => {
    const { store } = makeStore();

    expect(() =>
      store.createPatch(
        'world-map',
        {
          title: 'x'.repeat(121),
          description: '',
          dependencyIds: [],
        },
        'alice'
      )
    ).toThrow(/title must be at most 120 characters/);

    expect(() =>
      store.createComment(
        'world-map',
        {
          x: 1,
          y: 0,
          z: 2,
          text: 'x'.repeat(501),
        },
        'alice'
      )
    ).toThrow(/text must be at most 500 characters/);
  });

  it('publishes and rolls back patch snapshots across map + designer files', async () => {
    const { mapPath, designerPath, store } = makeStore();

    const state = store.getState('world-map');
    const zoneSnapshot = {
      ...state.zoneState,
      navAreas: [
        {
          id: 'nav-main',
          name: 'Main Lane',
          shape: 'circle',
          x: 10,
          y: 0,
          z: 10,
          radius: 7,
          width: 10,
          height: 10,
          walkCost: 1,
          runCost: 0.7,
          tags: ['lane'],
        },
      ],
    };

    const patch = store.createPatch(
      'world-map',
      {
        title: 'Nav lane test patch',
        description: 'Adds nav area and map size update',
        dependencyIds: [],
        sourceSnapshot: {
          mapConfig: buildMapConfig({ mapSize: 140 }),
          zoneState: zoneSnapshot,
        },
      },
      'alice'
    );

    store.transitionPatch(
      'world-map',
      patch.id,
      PATCH_STATUS.REVIEW_REQUESTED,
      'alice',
      'patch.request-approval'
    );
    store.transitionPatch(
      'world-map',
      patch.id,
      PATCH_STATUS.APPROVED,
      'alice',
      'patch.approve'
    );

    const publishResult = await store.publishPatch('world-map', patch.id, 'alice');
    expect(publishResult).toEqual({ ok: true, restartRequired: true });

    const publishedMap = readJson(mapPath);
    expect(publishedMap.mapSize).toBe(140);

    const afterPublish = loadDesignerStateSync(designerPath);
    const publishedZone = afterPublish.zones['world-map'];
    const publishedPatch = publishedZone.patches.find((entry) => entry.id === patch.id);
    expect(publishedPatch?.status).toBe(PATCH_STATUS.PUBLISHED);
    expect(publishedZone.navAreas.some((entry) => entry.id === 'nav-main')).toBe(true);

    const rollbackResult = await store.rollbackPatch('world-map', patch.id, 'alice');
    expect(rollbackResult).toEqual({ ok: true, restartRequired: true });

    const rolledBackMap = readJson(mapPath);
    expect(rolledBackMap.mapSize).toBe(90);

    const afterRollback = loadDesignerStateSync(designerPath);
    const rolledBackZone = afterRollback.zones['world-map'];
    const rolledBackPatch = rolledBackZone.patches.find((entry) => entry.id === patch.id);
    expect(rolledBackPatch?.status).toBe(PATCH_STATUS.ROLLED_BACK);
    expect(rolledBackZone.navAreas.some((entry) => entry.id === 'nav-main')).toBe(false);
  });
});
