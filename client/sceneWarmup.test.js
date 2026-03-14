import { describe, expect, it } from 'vitest';
import {
  ESSENTIAL_ENVIRONMENT_RADIUS,
  NEARBY_ENVIRONMENT_RADIUS,
  buildCatalogWarmupPlan,
  buildSceneWarmupPlan,
} from './sceneWarmup.js';

describe('sceneWarmup', () => {
  it('splits structure warmup into essential and nearby tiers around the local player', () => {
    const worldConfig = {
      base: { x: 0, z: 0 },
      vendors: [{ id: 'vendor-near', x: 5, z: 4 }],
      obstacles: [{ id: 'rock-near', x: 10, z: 10, r: 2 }],
      structures: [
        { id: 'house-near', kind: 'houseA', x: ESSENTIAL_ENVIRONMENT_RADIUS - 1, z: 0 },
        { id: 'house-mid', kind: 'houseB', x: NEARBY_ENVIRONMENT_RADIUS - 2, z: 0 },
        { id: 'house-far', kind: 'market', x: NEARBY_ENVIRONMENT_RADIUS + 10, z: 0 },
      ],
    };
    const localPlayer = {
      x: 0,
      z: 0,
      equipment: {
        chest: { kind: 'armor_chest_leather' },
      },
    };
    const publicPlayers = {
      remote: {
        visual: {
          outfitStyle: 'leather',
        },
      },
    };
    const mobs = [{ id: 'm1', mobType: 'orc' }];
    const resources = [{ id: 'r1', type: 'crystal' }];

    const plan = buildSceneWarmupPlan({
      worldConfig,
      localPlayer,
      publicPlayers,
      mobs,
      resources,
    });

    expect(plan.focusPos).toEqual({ x: 0, z: 0 });
    expect(plan.essential.vendorModel).toBe(true);
    expect(plan.essential.structurePlacements.map((placement) => placement.id)).toEqual(['house-near']);
    expect(plan.nearby.structurePlacements.map((placement) => placement.id)).toEqual(['house-mid']);
    expect(plan.essential.mobUrls).toHaveLength(1);
    expect(plan.essential.resourceUrls).toHaveLength(1);
    expect(plan.essential.playerVisuals).toHaveLength(1);
    expect(plan.nearby.obstacleRockUrls.length).toBeGreaterThan(0);
  });

  it('builds a full catalog warmup set for idle background loading', () => {
    const catalog = buildCatalogWarmupPlan();

    expect(catalog.playerAnimations).toBe(true);
    expect(catalog.vendorModel).toBe(true);
    expect(catalog.playerVisuals).toHaveLength(1);
    expect(catalog.gltfUrls.length).toBeGreaterThan(20);
    expect(catalog.textureUrls.length).toBeGreaterThan(0);
  });
});
