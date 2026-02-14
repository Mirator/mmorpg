// @ts-check

/**
 * Recipe definition: { id, name?, inputs: [{ kind, count }], output: { kind, count }, category? }
 * @typedef {{ id: string, name?: string, inputs: { kind: string, count: number }[], output: { kind: string, count: number }, category?: string }} Recipe
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
  },
  {
    id: 'herb_health_potion',
    name: 'Minor Health Potion',
    inputs: [{ kind: 'herb', count: 2 }],
    output: { kind: 'consumable_minor_health_potion', count: 1 },
    category: 'consumable',
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
  },
];

/**
 * @param {string} id
 * @returns {Recipe | null}
 */
export function getRecipeById(id) {
  if (!id || typeof id !== 'string') return null;
  return RECIPES.find((r) => r.id === id) ?? null;
}

/**
 * @param {string} [category]
 * @returns {Recipe[]}
 */
export function getRecipesByCategory(category) {
  if (!category) return [...RECIPES];
  return RECIPES.filter((r) => r.category === category);
}
