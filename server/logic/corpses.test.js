import { describe, it, expect } from 'vitest';
import { createCorpse, stepCorpses, tryLootCorpse } from './corpses.js';
import { createInventory, addItem, countInventory } from './inventory.js';

describe('corpses', () => {
  it('creates corpse with copied inventory', () => {
    const inv = createInventory(5);
    addItem(inv, { kind: 'ore', name: 'Iron Ore', count: 3 }, 20);
    addItem(inv, { kind: 'crystal', name: 'Crystal', count: 1 }, 20);
    const corpse = createCorpse('p1', { x: 10, z: 20 }, inv, 1000);
    expect(corpse.id).toMatch(/^corpse-\d+$/);
    expect(corpse.playerId).toBe('p1');
    expect(corpse.pos).toEqual({ x: 10, y: 0, z: 20 });
    expect(corpse.expiresAt).toBe(1000);
    expect(corpse.inventory).toHaveLength(5);
    const items = corpse.inventory.filter(Boolean);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.kind === 'ore' && i.count === 3)).toBe(true);
  });

  it('removes expired corpses', () => {
    const corpses = [
      createCorpse('p1', { x: 0, z: 0 }, [], 100),
      createCorpse('p2', { x: 1, z: 1 }, [], 200),
      createCorpse('p3', { x: 2, z: 2 }, [], 300),
    ];
    stepCorpses(corpses, 150);
    expect(corpses).toHaveLength(2);
    expect(corpses.every((c) => c.expiresAt > 150)).toBe(true);
    stepCorpses(corpses, 250);
    expect(corpses).toHaveLength(1);
    stepCorpses(corpses, 350);
    expect(corpses).toHaveLength(0);
  });

  it('loots corpse and transfers items to player', () => {
    const inv = createInventory(5);
    addItem(inv, { kind: 'ore', name: 'Iron Ore', count: 2 }, 20);
    const corpse = createCorpse('p1', { x: 0, z: 0 }, inv, 10000);
    const corpses = [corpse];
    const player = {
      id: 'p1',
      pos: { x: 0, y: 0, z: 0 },
      inventory: createInventory(10),
      invStackMax: 20,
    };
    player.inv = countInventory(player.inventory);
    const result = tryLootCorpse(corpses, player, { lootRadius: 2.5 });
    expect(result.looted).toBe(true);
    expect(countInventory(player.inventory)).toBe(2);
    expect(player.inv).toBe(2);
    expect(corpses).toHaveLength(0);
  });

  it('does not loot corpse of another player', () => {
    const inv = createInventory(5);
    addItem(inv, { kind: 'ore', count: 2 }, 20);
    const corpse = createCorpse('p-other', { x: 0, z: 0 }, inv, 10000);
    const corpses = [corpse];
    const player = {
      id: 'p1',
      pos: { x: 0, y: 0, z: 0 },
      inventory: createInventory(10),
      invStackMax: 20,
    };
    const result = tryLootCorpse(corpses, player, { lootRadius: 2.5 });
    expect(result.looted).toBe(false);
    expect(corpses).toHaveLength(1);
  });

  it('does not loot corpse when too far', () => {
    const inv = createInventory(5);
    addItem(inv, { kind: 'ore', count: 2 }, 20);
    const corpse = createCorpse('p1', { x: 100, z: 100 }, inv, 10000);
    const corpses = [corpse];
    const player = {
      id: 'p1',
      pos: { x: 0, y: 0, z: 0 },
      inventory: createInventory(10),
      invStackMax: 20,
    };
    const result = tryLootCorpse(corpses, player, { lootRadius: 2.5 });
    expect(result.looted).toBe(false);
    expect(corpses).toHaveLength(1);
  });
});
