import { describe, expect, it } from 'vitest';
import {
  canBulkEditField,
  deepClone,
  getEntityByRef,
  layerForType,
  normalizeSelection,
  selectionKey,
} from './state.js';

function makeConfig() {
  return {
    mapSize: 100,
    base: { x: 0, y: 0, z: 0, radius: 4 },
    spawnPoints: [{ x: 1, y: 0, z: 1 }],
    obstacles: [{ x: 5, y: 0, z: 5, radius: 2 }],
    structures: [
      { id: 's1', kind: 'market', x: 0, y: 0, z: 0, colliderRadius: 3, collides: true },
      { id: 's2', kind: 'houseA', x: 2, y: 0, z: 0, colliderRadius: 3, collides: true },
    ],
    resourceNodes: [],
    vendors: [],
    mobSpawns: [],
  };
}

describe('map-v2 state helpers', () => {
  it('maps entity types to layers', () => {
    expect(layerForType('base')).toBe('terrain');
    expect(layerForType('spawnPoints')).toBe('spawns');
    expect(layerForType('mobSpawns')).toBe('spawns');
    expect(layerForType('structures')).toBe('props');
  });

  it('gets entities by selection ref', () => {
    const config = makeConfig();
    expect(getEntityByRef(config, { type: 'base', index: 0 })).toEqual(config.base);
    expect(getEntityByRef(config, { type: 'structures', index: 1 })).toEqual(config.structures[1]);
    expect(getEntityByRef(config, { type: 'structures', index: 50 })).toBeNull();
  });

  it('normalizes invalid selection refs', () => {
    const config = makeConfig();
    const normalized = normalizeSelection(config, [
      { type: 'structures', index: 0 },
      { type: 'structures', index: 99 },
      { type: 'base', index: 0 },
    ]);
    expect(normalized).toEqual([
      { type: 'structures', index: 0 },
      { type: 'base', index: 0 },
    ]);
  });

  it('checks bulk editable fields for same-type selections', () => {
    const config = makeConfig();
    expect(
      canBulkEditField(
        config,
        [
          { type: 'structures', index: 0 },
          { type: 'structures', index: 1 },
        ],
        'collides'
      )
    ).toBe(true);
    expect(
      canBulkEditField(
        config,
        [
          { type: 'structures', index: 0 },
          { type: 'spawnPoints', index: 0 },
        ],
        'x'
      )
    ).toBe(false);
  });

  it('creates stable selection keys and deep clones', () => {
    expect(selectionKey({ type: 'structures', index: 3 })).toBe('structures:3');
    const source = { nested: { value: 1 } };
    const clone = deepClone(source);
    clone.nested.value = 2;
    expect(source.nested.value).toBe(1);
  });
});
