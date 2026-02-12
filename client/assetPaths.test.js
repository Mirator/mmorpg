import { describe, it, expect } from 'vitest';
import { ASSET_PATHS, getPreloadAssetList } from './assetPaths.js';

describe('assetPaths', () => {
  it('has expected ASSET_PATHS structure', () => {
    expect(ASSET_PATHS).toHaveProperty('playerModel');
    expect(ASSET_PATHS).toHaveProperty('vendorModel');
    expect(ASSET_PATHS).toHaveProperty('playerBase');
    expect(ASSET_PATHS).toHaveProperty('playerOutfit');
    expect(ASSET_PATHS).toHaveProperty('playerAnimations');
    expect(ASSET_PATHS).toHaveProperty('monsters');
    expect(ASSET_PATHS.monsters).toHaveProperty('orc');
    expect(ASSET_PATHS).toHaveProperty('environment');
    expect(ASSET_PATHS.environment).toHaveProperty('market');
    expect(ASSET_PATHS.environment).toHaveProperty('houseA');
    expect(ASSET_PATHS.environment).toHaveProperty('houseB');
    expect(ASSET_PATHS.environment).toHaveProperty('barracks');
    expect(ASSET_PATHS.environment).toHaveProperty('storage');
    expect(ASSET_PATHS.environment).toHaveProperty('trees');
  });

  it('ASSET_PATHS uses /assets/quaternius root', () => {
    expect(ASSET_PATHS.playerModel).toMatch(/^\/assets\/quaternius\//);
    expect(ASSET_PATHS.monsters.orc).toMatch(/^\/assets\/quaternius\//);
    expect(ASSET_PATHS.environment.market).toMatch(/^\/assets\/quaternius\//);
  });

  it('getPreloadAssetList returns player, mobs, and environment', () => {
    const list = getPreloadAssetList();

    expect(list).toHaveProperty('player');
    expect(Array.isArray(list.player)).toBe(true);
    expect(list.player).toContain('assemblePlayerModel');
    expect(list.player).toContain('loadPlayerAnimations');

    expect(list).toHaveProperty('vendor');
    expect(Array.isArray(list.vendor)).toBe(true);
    expect(list.vendor).toContain(ASSET_PATHS.vendorModel);

    expect(list).toHaveProperty('mobs');
    expect(Array.isArray(list.mobs)).toBe(true);
    expect(list.mobs).toHaveLength(1);
    expect(list.mobs[0]).toBe(ASSET_PATHS.monsters.orc);

    expect(list).toHaveProperty('environment');
    expect(Array.isArray(list.environment)).toBe(true);
    expect(list.environment).toHaveLength(6);
    expect(list.environment).toContain(ASSET_PATHS.environment.market);
    expect(list.environment).toContain(ASSET_PATHS.environment.houseA);
    expect(list.environment).toContain(ASSET_PATHS.environment.houseB);
    expect(list.environment).toContain(ASSET_PATHS.environment.barracks);
    expect(list.environment).toContain(ASSET_PATHS.environment.storage);
    expect(list.environment).toContain(ASSET_PATHS.environment.trees);
  });
});
