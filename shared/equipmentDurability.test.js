import { describe, expect, it } from 'vitest';
import {
  getStatsFromEquipment,
  isDurabilityTrackedItem,
  repairDurability,
} from './equipment.js';

describe('equipment durability', () => {
  it('ignores broken items when computing stats', () => {
    const equipment = {
      weapon: {
        id: 'w1',
        kind: 'weapon_iron_blade',
        name: 'Iron Blade',
        count: 1,
        rarity: 'common',
        maxDurability: 20,
        durability: 0,
      },
      offhand: null,
      head: null,
      chest: {
        id: 'c1',
        kind: 'armor_chest_crude_plate',
        name: 'Crude Plate Vest',
        count: 1,
        rarity: 'uncommon',
        maxDurability: 30,
        durability: 0,
      },
      legs: null,
      feet: null,
    };

    expect(getStatsFromEquipment(equipment)).toEqual({
      str: 0,
      dex: 0,
      int: 0,
      vit: 0,
      spi: 0,
      armor: 0,
      magicResist: 0,
      accuracy: 0,
      evasion: 0,
    });

    expect(repairDurability(equipment.weapon)).toBe(true);
    expect(repairDurability(equipment.chest)).toBe(true);
    expect(getStatsFromEquipment(equipment)).toEqual({
      str: 4,
      dex: 0,
      int: 0,
      vit: 2,
      spi: 0,
      armor: 7,
      magicResist: 0,
      accuracy: 0,
      evasion: 0,
    });
  });

  it('does not track durability for starter items', () => {
    const starterWeapon = {
      id: 'w2',
      kind: 'weapon_training_sword',
      name: 'Training Sword',
      count: 1,
      isStarter: true,
      maxDurability: 20,
      durability: 10,
    };

    expect(isDurabilityTrackedItem(starterWeapon)).toBe(false);
  });
});
