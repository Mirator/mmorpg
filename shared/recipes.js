// @ts-check

import { getProfessionLevel } from './professions.js';

/**
 * Recipe definition for portable and station-based crafting.
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   inputs: { kind: string, count: number }[],
 *   output: { kind: string, count: number },
 *   category?: string,
 *   profession?: 'smithing' | 'alchemy' | 'woodcraft',
 *   stationType?: 'forge' | 'alchemy_table' | 'workbench' | null,
 *   masteryLevelRequired?: number,
 *   portable?: boolean,
 *   outputRarity?: 'common' | 'uncommon' | 'rare',
 *   unlockAtMasteryLevel?: number,
 * }} Recipe
 */

/** @type {Recipe[]} */
export const RECIPES = [
  {
    id: 'ore_crystal_sword',
    name: 'Training Sword',
    inputs: [
      { kind: 'ore', count: 2 },
      { kind: 'crystal', count: 1 },
    ],
    output: { kind: 'weapon_training_sword', count: 1 },
    category: 'weapon',
    portable: true,
  },
  {
    id: 'herb_health_potion',
    name: 'Minor Health Potion',
    inputs: [{ kind: 'herb', count: 2 }],
    output: { kind: 'consumable_minor_health_potion', count: 1 },
    category: 'consumable',
    portable: true,
  },
  {
    id: 'herb_mana_potion',
    name: 'Minor Mana Potion',
    inputs: [
      { kind: 'herb', count: 2 },
      { kind: 'crystal', count: 1 },
    ],
    output: { kind: 'consumable_minor_mana_potion', count: 1 },
    category: 'consumable',
    portable: true,
  },
  {
    id: 'smith_iron_blade',
    name: 'Iron Blade',
    inputs: [
      { kind: 'ore', count: 4 },
      { kind: 'wood', count: 1 },
    ],
    output: { kind: 'weapon_iron_blade', count: 1 },
    category: 'weapon',
    profession: 'smithing',
    stationType: 'forge',
    masteryLevelRequired: 2,
    unlockAtMasteryLevel: 2,
    outputRarity: 'common',
  },
  {
    id: 'smith_reinforced_training_sword',
    name: 'Reinforced Training Sword',
    inputs: [
      { kind: 'ore', count: 5 },
      { kind: 'crystal', count: 2 },
    ],
    output: { kind: 'weapon_reinforced_training_sword', count: 1 },
    category: 'weapon',
    profession: 'smithing',
    stationType: 'forge',
    masteryLevelRequired: 4,
    unlockAtMasteryLevel: 4,
    outputRarity: 'uncommon',
  },
  {
    id: 'smith_crude_plate',
    name: 'Crude Plate Vest',
    inputs: [
      { kind: 'ore', count: 6 },
      { kind: 'wood', count: 2 },
    ],
    output: { kind: 'armor_chest_crude_plate', count: 1 },
    category: 'armor',
    profession: 'smithing',
    stationType: 'forge',
    masteryLevelRequired: 5,
    unlockAtMasteryLevel: 5,
    outputRarity: 'uncommon',
  },
  {
    id: 'alchemy_strong_health',
    name: 'Strong Health Potion',
    inputs: [
      { kind: 'herb', count: 4 },
      { kind: 'flower', count: 1 },
    ],
    output: { kind: 'consumable_strong_health_potion', count: 1 },
    category: 'consumable',
    profession: 'alchemy',
    stationType: 'alchemy_table',
    masteryLevelRequired: 2,
    unlockAtMasteryLevel: 2,
    outputRarity: 'common',
  },
  {
    id: 'alchemy_strong_mana',
    name: 'Strong Mana Potion',
    inputs: [
      { kind: 'herb', count: 3 },
      { kind: 'crystal', count: 2 },
    ],
    output: { kind: 'consumable_strong_mana_potion', count: 1 },
    category: 'consumable',
    profession: 'alchemy',
    stationType: 'alchemy_table',
    masteryLevelRequired: 3,
    unlockAtMasteryLevel: 3,
    outputRarity: 'common',
  },
  {
    id: 'alchemy_cleansing_tonic',
    name: 'Cleansing Tonic',
    inputs: [
      { kind: 'herb', count: 3 },
      { kind: 'flower', count: 2 },
      { kind: 'crystal', count: 1 },
    ],
    output: { kind: 'consumable_cleansing_tonic', count: 1 },
    category: 'consumable',
    profession: 'alchemy',
    stationType: 'alchemy_table',
    masteryLevelRequired: 5,
    unlockAtMasteryLevel: 5,
    outputRarity: 'uncommon',
  },
  {
    id: 'woodcraft_reinforced_bow',
    name: 'Reinforced Training Bow',
    inputs: [
      { kind: 'wood', count: 5 },
      { kind: 'ore', count: 1 },
    ],
    output: { kind: 'weapon_reinforced_training_bow', count: 1 },
    category: 'weapon',
    profession: 'woodcraft',
    stationType: 'workbench',
    masteryLevelRequired: 2,
    unlockAtMasteryLevel: 2,
    outputRarity: 'common',
  },
  {
    id: 'woodcraft_travel_kit',
    name: 'Travel Kit',
    inputs: [
      { kind: 'wood', count: 3 },
      { kind: 'flower', count: 1 },
    ],
    output: { kind: 'consumable_travel_kit', count: 1 },
    category: 'consumable',
    profession: 'woodcraft',
    stationType: 'workbench',
    masteryLevelRequired: 3,
    unlockAtMasteryLevel: 3,
    outputRarity: 'common',
  },
  {
    id: 'woodcraft_focus_component',
    name: 'Wooden Focus',
    inputs: [
      { kind: 'wood', count: 4 },
      { kind: 'crystal', count: 2 },
    ],
    output: { kind: 'offhand_wooden_focus', count: 1 },
    category: 'offhand',
    profession: 'woodcraft',
    stationType: 'workbench',
    masteryLevelRequired: 5,
    unlockAtMasteryLevel: 5,
    outputRarity: 'rare',
  },
];

const RECIPE_BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
const RECIPE_BY_OUTPUT_KIND = new Map(RECIPES.map((recipe) => [recipe.output.kind, recipe]));

/**
 * @param {string} id
 * @returns {Recipe | null}
 */
export function getRecipeById(id) {
  if (!id || typeof id !== 'string') return null;
  return RECIPE_BY_ID.get(id) ?? null;
}

/**
 * @param {string} kind
 * @returns {Recipe | null}
 */
export function getRecipeByOutputKind(kind) {
  if (!kind || typeof kind !== 'string') return null;
  return RECIPE_BY_OUTPUT_KIND.get(kind) ?? null;
}

/**
 * @param {string} [category]
 * @returns {Recipe[]}
 */
export function getRecipesByCategory(category) {
  if (!category) return [...RECIPES];
  return RECIPES.filter((recipe) => recipe.category === category);
}

export function getDefaultKnownRecipeIds() {
  return RECIPES.filter((recipe) => recipe.portable === true).map((recipe) => recipe.id);
}

export function getUnlockedRecipeIdsForMasteries(/** @type {any} */ masteries) {
  const unlocked = new Set(getDefaultKnownRecipeIds());
  for (const recipe of RECIPES) {
    if (!recipe.profession) continue;
    const requiredLevel = Math.max(
      1,
      Math.floor(
        Number(
          recipe.unlockAtMasteryLevel ??
          recipe.masteryLevelRequired ??
          1
        ) || 1
      )
    );
    if (getProfessionLevel(masteries, recipe.profession) >= requiredLevel) {
      unlocked.add(recipe.id);
    }
  }
  return Array.from(unlocked);
}

export function isRecipeKnown(/** @type {any} */ recipeId, /** @type {any} */ knownRecipeIds) {
  if (typeof recipeId !== 'string' || recipeId.length === 0) return false;
  if (!Array.isArray(knownRecipeIds)) return false;
  return knownRecipeIds.includes(recipeId);
}

export function getRecipesForKnownIds(/** @type {any} */ knownRecipeIds) {
  if (!Array.isArray(knownRecipeIds)) return RECIPES.filter((recipe) => recipe.portable === true);
  const known = new Set(knownRecipeIds);
  return RECIPES.filter((recipe) => known.has(recipe.id));
}
