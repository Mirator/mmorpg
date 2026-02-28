import { describe, expect, it } from 'vitest';
import {
  getRecipesForKnownIds,
  getUnlockedRecipeIdsForMasteries,
} from './recipes.js';
import { createProfessionMasteries } from './professions.js';

describe('recipes', () => {
  it('returns starter recipes when no known list is provided', () => {
    const recipes = getRecipesForKnownIds(null);
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.every((recipe) => recipe.portable === true)).toBe(true);
  });

  it('unlocks profession recipes by mastery thresholds', () => {
    const masteries = createProfessionMasteries({
      smithing: { level: 5, xp: 0 },
      alchemy: { level: 3, xp: 0 },
      woodcraft: { level: 2, xp: 0 },
    });
    const unlocked = getUnlockedRecipeIdsForMasteries(masteries);
    expect(unlocked).toContain('smith_iron_blade');
    expect(unlocked).toContain('smith_reinforced_training_sword');
    expect(unlocked).toContain('smith_crude_plate');
    expect(unlocked).toContain('alchemy_strong_mana');
    expect(unlocked).toContain('woodcraft_reinforced_bow');
    expect(unlocked).not.toContain('woodcraft_focus_component');
  });
});
