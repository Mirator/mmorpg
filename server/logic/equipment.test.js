import { describe, it, expect } from 'vitest';
import { swapEquipment } from './equipment.js';

function makeEquipment() {
  return {
    weapon: {
      id: 'w1',
      kind: 'weapon_training_sword',
      name: 'Training Sword',
      count: 1,
    },
    offhand: null,
    head: null,
    chest: null,
    legs: null,
    feet: null,
  };
}

describe('equipment swap', () => {
  it('rejects invalid items for equipment slots', () => {
    const inventory = [
      { id: 'i1', kind: 'crystal', name: 'Crystal', count: 1 },
      null,
    ];
    const equipment = makeEquipment();
    const swapped = swapEquipment({
      inventory,
      equipment,
      fromType: 'inventory',
      fromSlot: 0,
      toType: 'equipment',
      toSlot: 'weapon',
    });
    expect(swapped).toBe(false);
    expect(equipment.weapon?.kind).toBe('weapon_training_sword');
  });

  it('swaps weapon between inventory and equipment', () => {
    const inventory = [
      { id: 'w2', kind: 'weapon_training_bow', name: 'Training Bow', count: 1 },
      null,
    ];
    const equipment = makeEquipment();
    const swapped = swapEquipment({
      inventory,
      equipment,
      fromType: 'inventory',
      fromSlot: 0,
      toType: 'equipment',
      toSlot: 'weapon',
    });
    expect(swapped).toBe(true);
    expect(equipment.weapon?.kind).toBe('weapon_training_bow');
    expect(inventory[0]?.kind).toBe('weapon_training_sword');
  });
});
