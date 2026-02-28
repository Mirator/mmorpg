import { describe, expect, it } from 'vitest';
import {
  ABILITY_ICON_BY_ID,
  EMPTY_EQUIPMENT_ICON_BY_SLOT,
  GAME_ICON_CREDITS,
  getAbilityIconFile,
  getGameIconUrl,
  ITEM_ICON_BY_KIND,
} from './gameIcons.js';

describe('game icon catalog', () => {
  it('resolves all mapped icons under the shipped asset path', () => {
    const files = [
      ...Object.values(ITEM_ICON_BY_KIND),
      ...Object.values(EMPTY_EQUIPMENT_ICON_BY_SLOT),
      ...Object.values(ABILITY_ICON_BY_ID),
    ];
    for (const file of files) {
      expect(getGameIconUrl(file)).toMatch(/^\/assets\/ui\/icons\/game-icons\/lorc\/.+\.svg$/);
    }
  });

  it('publishes the exact used icon union for credits', () => {
    const expected = Array.from(
      new Set([
        ...Object.values(ITEM_ICON_BY_KIND),
        ...Object.values(EMPTY_EQUIPMENT_ICON_BY_SLOT),
        ...Object.values(ABILITY_ICON_BY_ID),
      ])
    ).sort();
    expect(GAME_ICON_CREDITS.usedFiles).toEqual(expected);
  });

  it('resolves basic attack icons from the equipped weapon kind', () => {
    expect(getAbilityIconFile({ id: 'basic_attack' }, { kind: 'weapon_training_bow' })).toBe(
      'lorc/bowman.svg'
    );
    expect(getAbilityIconFile({ id: 'basic_attack' }, { kind: 'weapon_training_staff' })).toBe(
      'lorc/wizard-staff.svg'
    );
    expect(getAbilityIconFile({ id: 'basic_attack' }, { kind: 'weapon_apprentice_wand' })).toBe(
      'lorc/crystal-wand.svg'
    );
    expect(getAbilityIconFile({ id: 'basic_attack' }, { kind: 'weapon_training_sword' })).toBe(
      'lorc/broadsword.svg'
    );
  });
});
