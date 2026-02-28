import { describe, expect, it } from 'vitest';
import { getAbilitiesForClass } from './classes.js';
import { getAbilityPresentation } from './abilityPresentation.js';
import { getEquippedWeapon } from './equipment.js';

function getAbilityFor(/** @type {string} */ classId, /** @type {number} */ level, /** @type {string} */ abilityId) {
  const weaponDef = getEquippedWeapon({}, classId);
  const ability = getAbilitiesForClass(classId, level, weaponDef).find((entry) => entry.id === abilityId);
  return { ability, weaponDef };
}

describe('getAbilityPresentation', () => {
  it('returns the fire palette and mana copy for firebolt', () => {
    const { ability, weaponDef } = getAbilityFor('mage', 3, 'firebolt');
    const presentation = getAbilityPresentation(ability, { classId: 'mage', weaponDef });

    expect(presentation.summary).toContain('chilled targets');
    expect(presentation.costLabel).toBe('40 Mana');
    expect(presentation.primaryRgb).toBe('255, 102, 51');
    expect(presentation.secondaryRgb).toBe('255, 176, 102');
  });

  it('returns the frost palette for frost nova', () => {
    const { ability, weaponDef } = getAbilityFor('mage', 3, 'frost_nova');
    const presentation = getAbilityPresentation(ability, { classId: 'mage', weaponDef });

    expect(presentation.summary).toContain('damage, slow, and chill');
    expect(presentation.primaryRgb).toBe('136, 204, 255');
    expect(presentation.secondaryRgb).toBe('216, 241, 255');
    expect(presentation.metaLabel).toContain('Radius: 2.5m');
  });

  it('returns guardian defensive copy for defensive stance', () => {
    const { ability, weaponDef } = getAbilityFor('guardian', 3, 'defensive_stance');
    const presentation = getAbilityPresentation(ability, { classId: 'guardian', weaponDef });

    expect(presentation.summary).toContain('reduce damage taken');
    expect(presentation.costLabel).toBe('40 Stamina');
    expect(presentation.primaryRgb).toBe('139, 115, 85');
  });

  it('handles zero-cost skills without a resource label', () => {
    const { ability, weaponDef } = getAbilityFor('fighter', 20, 'blood_rage');
    const presentation = getAbilityPresentation(ability, { classId: 'fighter', weaponDef });

    expect(presentation.summary).toContain('Consume all current rage');
    expect(presentation.costLabel).toBe('No resource cost');
    expect(presentation.metaLabel).toContain('No resource cost');
    expect(presentation.primaryRgb).toBe('255, 102, 51');
  });
});
