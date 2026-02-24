import { describe, it, expect } from 'vitest';
import { createInventory } from './inventory.js';
import {
  createResources,
  stepResources,
  tryHarvest,
  tryStartHarvest,
  stepPlayerHarvest,
} from './resources.js';

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
    expect(resources[0].respawnAt).toBe(16000);
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

  it('starts a timed harvest without granting item immediately', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0, type: 'tree' }]);
    const player = {
      pos: { x: 0.4, z: 0.4 },
      hp: 100,
      inv: 0,
      invStackMax: 20,
      inventory: createInventory(20),
      movedThisTick: false,
      dead: false,
    };

    const started = tryStartHarvest(resources, player, 1000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });

    expect(started).toMatchObject({
      resourceId: 'r1',
      resourceType: 'tree',
      startedAt: 1000,
      endsAt: 3500,
    });
    expect(player.inv).toBe(0);
    expect(resources[0].available).toBe(true);
  });

  it('completes timed harvest after duration and sets respawn', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0, type: 'tree' }]);
    const player = {
      pos: { x: 0.4, z: 0.4 },
      hp: 100,
      inv: 0,
      invStackMax: 20,
      inventory: createInventory(20),
      movedThisTick: false,
      dead: false,
    };

    tryStartHarvest(resources, player, 1000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });

    const beforeEnd = stepPlayerHarvest(resources, player, 3400, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      respawnMs: 5000,
      stackMax: player.invStackMax,
    });
    expect(beforeEnd?.status).toBe('in_progress');
    expect(player.inv).toBe(0);
    expect(resources[0].available).toBe(true);

    const completed = stepPlayerHarvest(resources, player, 3500, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      respawnMs: 5000,
      stackMax: player.invStackMax,
      makeItem: () => ({ id: 'i-tree', kind: 'wood', name: 'Wood', count: 1 }),
    });
    expect(completed?.status).toBe('completed');
    expect(player.inv).toBe(1);
    expect(player.inventory[0]).toMatchObject({ kind: 'wood', name: 'Wood', count: 1 });
    expect(resources[0].available).toBe(false);
    expect(resources[0].respawnAt).toBe(3500 + 25_000);
  });

  it('cancels timed harvest on movement, damage, or death', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0, type: 'ore' }]);
    const player = {
      pos: { x: 0.4, z: 0.4 },
      hp: 100,
      inv: 0,
      invStackMax: 20,
      inventory: createInventory(20),
      movedThisTick: false,
      dead: false,
    };

    tryStartHarvest(resources, player, 1000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    player.movedThisTick = true;
    const moved = stepPlayerHarvest(resources, player, 1200, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(moved?.status).toBe('cancelled');
    expect(moved?.reason).toBe('moved');
    expect(player.harvest).toBeNull();

    player.movedThisTick = false;
    tryStartHarvest(resources, player, 2000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    player.hp = 90;
    const damaged = stepPlayerHarvest(resources, player, 2300, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(damaged?.status).toBe('cancelled');
    expect(damaged?.reason).toBe('damaged');
    expect(player.harvest).toBeNull();

    player.hp = 100;
    tryStartHarvest(resources, player, 3000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    player.dead = true;
    const dead = stepPlayerHarvest(resources, player, 3100, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(dead?.status).toBe('cancelled');
    expect(dead?.reason).toBe('dead');
    expect(player.harvest).toBeNull();
  });

  it('cancels timed harvest when out of range, depleted, or inventory full', () => {
    const resources = createResources([{ id: 'r1', x: 0, z: 0, type: 'flower' }]);
    const player = {
      pos: { x: 0.2, z: 0.2 },
      hp: 100,
      inv: 0,
      invStackMax: 1,
      inventory: createInventory(1),
      movedThisTick: false,
      dead: false,
    };

    tryStartHarvest(resources, player, 1000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    player.pos = { x: 10, z: 10 };
    const outOfRange = stepPlayerHarvest(resources, player, 1200, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(outOfRange?.reason).toBe('out_of_range');

    player.pos = { x: 0.2, z: 0.2 };
    tryStartHarvest(resources, player, 2000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    resources[0].available = false;
    const missing = stepPlayerHarvest(resources, player, 2300, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(missing?.reason).toBe('resource_missing');

    resources[0].available = true;
    tryStartHarvest(resources, player, 3000, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    player.inventory[0] = { id: 'full', kind: 'flower', name: 'Flower', count: 1 };
    const inventoryFull = stepPlayerHarvest(resources, player, 3100, {
      harvestRadius: 2,
      harvestDurationMs: 2500,
      stackMax: player.invStackMax,
    });
    expect(inventoryFull?.reason).toBe('inventory_full');
  });
});
