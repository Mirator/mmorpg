import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCraft } from './craft.js';
import { createInventory } from '../../logic/inventory.js';
import { addItem } from '../../logic/inventory.js';
import { getRecipeById } from '../../../shared/recipes.js';

function createPlayer(overrides = {}) {
  const inv = createInventory(12);
  return {
    id: 'p1',
    name: 'Alice',
    pos: { x: 0, y: 0, z: 0 },
    inventory: inv,
    invStackMax: 20,
    knownRecipes: ['herb_health_potion', 'herb_mana_potion'],
    professionMastery: {},
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
    safeSend: vi.fn(),
    ws: {},
    ...overrides,
  };
}

describe('craft handler', () => {
  const world = {
    structures: [],
  };

  describe('handleCraft', () => {
    it('crafts portable recipe when player has ingredients', () => {
      const recipe = getRecipeById('herb_health_potion');
      expect(recipe?.portable).toBe(true);
      const player = createPlayer();
      addItem(player.inventory, { id: 'i1', kind: 'herb', count: 4 }, 20);
      player.inv = 4;
      const ctx = ctxWith(player, world, { type: 'craft', recipeId: 'herb_health_potion', count: 1 });
      handleCraft(ctx);
      const herbCount = player.inventory.reduce((/** @type {number} */ n, /** @type {any} */ i) =>
        i?.kind === 'herb' ? n + (i.count ?? 0) : n, 0);
      expect(herbCount).toBe(2);
      const potionSlot = player.inventory.find((/** @type {any} */ i) =>
        i?.kind === 'consumable_minor_health_potion');
      expect(potionSlot).toBeDefined();
      expect(potionSlot?.count).toBe(1);
      expect(ctx.persistence.markDirty).toHaveBeenCalledWith(player);
    });

    it('does nothing when recipe unknown', () => {
      const player = createPlayer();
      addItem(player.inventory, { id: 'i1', kind: 'herb', count: 4 }, 20);
      const ctx = ctxWith(player, world, { type: 'craft', recipeId: 'ore_crystal_sword', count: 1 });
      handleCraft(ctx);
      const swordSlot = player.inventory.find((/** @type {any} */ i) =>
        i?.kind === 'weapon_training_sword');
      expect(swordSlot).toBeUndefined();
    });

    it('does nothing when insufficient ingredients', () => {
      const player = createPlayer();
      addItem(player.inventory, { id: 'i1', kind: 'herb', count: 1 }, 20);
      const ctx = ctxWith(player, world, { type: 'craft', recipeId: 'herb_health_potion', count: 1 });
      handleCraft(ctx);
      const potionSlot = player.inventory.find((/** @type {any} */ i) =>
        i?.kind === 'consumable_minor_health_potion');
      expect(potionSlot).toBeUndefined();
    });

    it('does nothing when recipe not found', () => {
      const player = createPlayer();
      const ctx = ctxWith(player, world, { type: 'craft', recipeId: 'nonexistent_recipe', count: 1 });
      handleCraft(ctx);
      expect(ctx.persistence.markDirty).not.toHaveBeenCalled();
    });
  });
});
