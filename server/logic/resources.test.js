import { describe, it, expect } from 'vitest';
import { createInventory } from './inventory.js';
import { createResources, stepResources, tryHarvest } from './resources.js';

describe('resources', () => {
  it('harvests within radius and schedules respawn', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0 }]);
    const player = {
      pos: { x: 0.5, z: 0.5 },
      inv: 0,
      invStackMax: 20,
      inventory: createInventory(20),
    };
    const now = 1000;
    const result = tryHarvest(resources, player, now, {
      harvestRadius: 2,
      respawnMs: 5000,
      stackMax: player.invStackMax,
      itemKind: 'crystal',
      itemName: 'Crystal',
      makeItem: () => ({
        id: 'i1',
        kind: 'crystal',
        name: 'Crystal',
        count: 1,
      }),
    });

    expect(result?.id).toBe('r1');
    expect(player.inv).toBe(1);
    expect(player.inventory[0]).toMatchObject({ kind: 'crystal', count: 1 });
    expect(resources[0].available).toBe(false);
    expect(resources[0].respawnAt).toBe(6000);
  });

  it('does not harvest when inventory is full', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0 }]);
    const player = {
      pos: { x: 0, z: 0 },
      inv: 1,
      invStackMax: 1,
      inventory: [{ id: 'i1', kind: 'crystal', name: 'Crystal', count: 1 }],
    };
    const result = tryHarvest(resources, player, 0, {
      harvestRadius: 2,
      respawnMs: 5000,
      stackMax: player.invStackMax,
      itemKind: 'crystal',
      itemName: 'Crystal',
    });

    expect(result).toBeNull();
    expect(resources[0].available).toBe(true);
  });

  it('stacks harvested items by kind', () => {
    const resources = createResources([
      { id: 'r1', x: 0, z: 0 },
      { id: 'r2', x: 1, z: 0 },
    ]);
    const player = {
      pos: { x: 0, z: 0 },
      inv: 0,
      invStackMax: 3,
      inventory: createInventory(2),
    };

    const first = tryHarvest(resources, player, 1000, {
      harvestRadius: 2,
      respawnMs: 5000,
      stackMax: player.invStackMax,
      itemKind: 'crystal',
      itemName: 'Crystal',
      makeItem: () => ({
        id: 'i1',
        kind: 'crystal',
        name: 'Crystal',
        count: 1,
      }),
    });
    expect(first?.id).toBe('r1');
    expect(player.inv).toBe(1);
    expect(player.inventory[0]).toMatchObject({ kind: 'crystal', count: 1 });

    const second = tryHarvest(resources, player, 1200, {
      harvestRadius: 2,
      respawnMs: 5000,
      stackMax: player.invStackMax,
      itemKind: 'crystal',
      itemName: 'Crystal',
      makeItem: () => ({
        id: 'i2',
        kind: 'crystal',
        name: 'Crystal',
        count: 1,
      }),
    });
    expect(second?.id).toBe('r2');
    expect(player.inv).toBe(2);
    expect(player.inventory[0]).toMatchObject({ kind: 'crystal', count: 2 });
    expect(player.inventory[1]).toBeNull();
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
