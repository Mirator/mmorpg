import { describe, it, expect } from 'vitest';
import {
  createInventory,
  countInventory,
  countItem,
  consumeItems,
  canAddItem,
  addItem,
  swapInventorySlots,
} from './inventory.js';

describe('inventory', () => {
  it('countItem returns total count of kind', () => {
    const inv = [
      { kind: 'ore', count: 3 },
      { kind: 'crystal', count: 1 },
      { kind: 'ore', count: 2 },
      null,
    ];
    expect(countItem(inv, 'ore')).toBe(5);
    expect(countItem(inv, 'crystal')).toBe(1);
    expect(countItem(inv, 'herb')).toBe(0);
    expect(countItem([], 'ore')).toBe(0);
    expect(countItem(inv, '')).toBe(0);
  });

  it('consumeItems removes items and returns true when sufficient', () => {
    const inv = [
      { kind: 'ore', count: 2 },
      { kind: 'ore', count: 3 },
      { kind: 'crystal', count: 1 },
    ];
    expect(consumeItems(inv, 'ore', 4)).toBe(true);
    expect(inv[0]).toBe(null);
    expect(inv[1]).toEqual({ kind: 'ore', count: 1 });
    expect(inv[2]).toEqual({ kind: 'crystal', count: 1 });
  });

  it('consumeItems returns false and does not mutate when insufficient', () => {
    const inv = [
      { kind: 'ore', count: 2 },
      { kind: 'ore', count: 1 },
    ];
    expect(consumeItems(inv, 'ore', 5)).toBe(false);
    expect(inv[0]).toEqual({ kind: 'ore', count: 2 });
    expect(inv[1]).toEqual({ kind: 'ore', count: 1 });
  });

  it('consumeItems clears slot when taking all', () => {
    const inv = [{ kind: 'herb', count: 2 }];
    expect(consumeItems(inv, 'herb', 2)).toBe(true);
    expect(inv[0]).toBe(null);
  });
});
