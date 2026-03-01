import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleVendorSell, handleVendorBuy } from './vendor.js';
import { createInventory } from '../../logic/inventory.js';
import { addItem } from '../../logic/inventory.js';

function createPlayer(overrides = {}) {
  const inv = createInventory(6);
  return {
    id: 'p1',
    name: 'Alice',
    pos: { x: 0, y: 0, z: 0 },
    inventory: inv,
    invStackMax: 20,
    currencyCopper: 100,
    knownRecipes: [],
    ...overrides,
  };
}

/**
 * @param {any} ctx
 */
function ctxWith(player, world, msg, overrides = {}) {
  return {
    player,
    world,
    msg,
    persistence: { markDirty: vi.fn() },
    nextItemIdRef: { current: 1000 },
    ...overrides,
  };
}

describe('vendor handlers', () => {
  const vendor = {
    id: 'v1',
    x: 0,
    z: 0,
    buyItems: [
      { kind: 'consumable_minor_health_potion', name: 'Minor Health Potion', priceCopper: 25, category: 'consumable' },
      { kind: 'crystal', name: 'Crystal', priceCopper: 10, category: 'resource' },
    ],
  };

  const world = {
    vendors: [vendor],
    vendorInteractRadius: 2.5,
  };

  describe('handleVendorSell', () => {
    it('sells item and adds copper', () => {
      const player = createPlayer({ pos: { x: 0, y: 0, z: 0 } });
      addItem(player.inventory, { id: 'i1', kind: 'crystal', count: 2 }, 20);
      player.inv = 2;
      const ctx = ctxWith(player, world, { type: 'vendorSell', vendorId: 'v1', slot: 0 });
      handleVendorSell(ctx);
      expect(player.inventory[0]).toBeNull();
      expect(player.currencyCopper).toBe(120);
      expect(ctx.persistence.markDirty).toHaveBeenCalledWith(player);
    });

    it('does nothing when vendor not found', () => {
      const player = createPlayer();
      addItem(player.inventory, { id: 'i1', kind: 'crystal', count: 1 }, 20);
      const ctx = ctxWith(player, world, { type: 'vendorSell', vendorId: 'unknown', slot: 0 });
      handleVendorSell(ctx);
      expect(player.inventory[0]).not.toBeNull();
      expect(player.currencyCopper).toBe(100);
    });

    it('does nothing when too far from vendor', () => {
      const player = createPlayer({ pos: { x: 10, y: 0, z: 10 } });
      addItem(player.inventory, { id: 'i1', kind: 'crystal', count: 1 }, 20);
      const ctx = ctxWith(player, world, { type: 'vendorSell', vendorId: 'v1', slot: 0 });
      handleVendorSell(ctx);
      expect(player.inventory[0]).not.toBeNull();
    });
  });

  describe('handleVendorBuy', () => {
    it('buys item and deducts copper', () => {
      const player = createPlayer({ pos: { x: 0, y: 0, z: 0 }, currencyCopper: 100 });
      const ctx = ctxWith(player, world, {
        type: 'vendorBuy',
        vendorId: 'v1',
        kind: 'consumable_minor_health_potion',
        count: 1,
      });
      handleVendorBuy(ctx);
      expect(player.currencyCopper).toBe(75);
      const slot = player.inventory.find((/** @type {any} */ i) => i?.kind === 'consumable_minor_health_potion');
      expect(slot).toBeDefined();
      expect(slot?.count).toBe(1);
      expect(ctx.persistence.markDirty).toHaveBeenCalledWith(player);
    });

    it('does nothing when insufficient copper', () => {
      const player = createPlayer({ pos: { x: 0, y: 0, z: 0 }, currencyCopper: 10 });
      const ctx = ctxWith(player, world, {
        type: 'vendorBuy',
        vendorId: 'v1',
        kind: 'consumable_minor_health_potion',
        count: 1,
      });
      handleVendorBuy(ctx);
      expect(player.currencyCopper).toBe(10);
      expect(player.inventory.every((/** @type {any} */ i) => !i)).toBe(true);
    });

    it('does nothing when kind not in catalog', () => {
      const player = createPlayer({ pos: { x: 0, y: 0, z: 0 } });
      const ctx = ctxWith(player, world, {
        type: 'vendorBuy',
        vendorId: 'v1',
        kind: 'invalid_item',
        count: 1,
      });
      handleVendorBuy(ctx);
      expect(player.currencyCopper).toBe(100);
    });
  });
});