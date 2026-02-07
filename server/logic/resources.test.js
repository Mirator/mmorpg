import { describe, it, expect } from 'vitest';
import { createResources, stepResources, tryHarvest } from './resources.js';

describe('resources', () => {
  it('harvests within radius and schedules respawn', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0 }]);
    const player = { pos: { x: 0.5, z: 0.5 }, inv: 0, invCap: 5 };
    const now = 1000;
    const result = tryHarvest(resources, player, now, {
      harvestRadius: 2,
      respawnMs: 5000,
    });

    expect(result?.id).toBe('r1');
    expect(player.inv).toBe(1);
    expect(resources[0].available).toBe(false);
    expect(resources[0].respawnAt).toBe(6000);
  });

  it('does not harvest when inventory is full', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0 }]);
    const player = { pos: { x: 0, z: 0 }, inv: 5, invCap: 5 };
    const result = tryHarvest(resources, player, 0, {
      harvestRadius: 2,
      respawnMs: 5000,
    });

    expect(result).toBeNull();
    expect(resources[0].available).toBe(true);
  });

  it('respawns after cooldown', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0 }]);
    resources[0].available = false;
    resources[0].respawnAt = 2000;

    stepResources(resources, 1500);
    expect(resources[0].available).toBe(false);

    stepResources(resources, 2000);
    expect(resources[0].available).toBe(true);
  });
});
