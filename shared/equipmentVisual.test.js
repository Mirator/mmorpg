import { describe, expect, it } from 'vitest';
import {
  buildEquipmentVisualSignature,
  buildEquipmentVisualState,
  resolveOutfitStyleFromEquipment,
} from './equipment.js';

describe('equipment visual helpers', () => {
  it('prefers chest style over other armor slots', () => {
    const equipment = {
      weapon: null,
      offhand: null,
      head: { kind: 'armor_head_cloth' },
      chest: { kind: 'armor_chest_leather' },
      legs: { kind: 'armor_legs_cloth' },
      feet: { kind: 'armor_feet_leather' },
    };

    expect(resolveOutfitStyleFromEquipment(equipment)).toBe('leather');
  });

  it('falls back chest -> legs -> feet -> head', () => {
    expect(resolveOutfitStyleFromEquipment({
      chest: null,
      legs: { kind: 'armor_legs_cloth' },
      feet: { kind: 'armor_feet_leather' },
      head: { kind: 'armor_head_cloth' },
    })).toBe('cloth');

    expect(resolveOutfitStyleFromEquipment({
      chest: null,
      legs: null,
      feet: { kind: 'armor_feet_leather' },
      head: { kind: 'armor_head_cloth' },
    })).toBe('leather');

    expect(resolveOutfitStyleFromEquipment({
      chest: null,
      legs: null,
      feet: null,
      head: { kind: 'armor_head_cloth' },
    })).toBe('cloth');
  });

  it('builds normalized visual state and stable signature', () => {
    const visual = buildEquipmentVisualState({
      weapon: { kind: 'weapon_training_sword' },
      offhand: { kind: 'offhand_wooden_focus' },
      head: { kind: 'armor_head_cloth' },
      chest: null,
      legs: null,
      feet: null,
    });

    expect(visual).toEqual({
      outfitStyle: 'cloth',
      headKind: 'armor_head_cloth',
      weaponKind: 'weapon_training_sword',
      offhandKind: 'offhand_wooden_focus',
    });

    const signatureA = buildEquipmentVisualSignature(visual);
    const signatureB = buildEquipmentVisualSignature({
      outfitStyle: 'cloth',
      headKind: 'armor_head_cloth',
      weaponKind: 'weapon_training_sword',
      offhandKind: 'offhand_wooden_focus',
    });
    expect(signatureA).toBe(signatureB);
  });
});
