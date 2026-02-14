import { RECIPES } from '/shared/recipes.js';
import { getItemDisplayName } from '/shared/economy.js';

/**
 * @param {Array<{ kind?: string, count?: number } | null>} inventory
 * @param {string} kind
 * @returns {number}
 */
function countItem(inventory, kind) {
  if (!Array.isArray(inventory) || !kind) return 0;
  return inventory.reduce((total, item) => {
    if (!item || item.kind !== kind) return total;
    return total + (Number(item.count) || 0);
  }, 0);
}

/**
 * @param {Object} opts
 * @param {HTMLElement} [opts.recipeListEl]
 * @param {Array<{ kind?: string, count?: number } | null>} [opts.inventory]
 * @param {Recipe[]} [opts.recipes]
 * @param {(recipeId: string, count: number) => void} [opts.onCraft]
 */
export function createCraftingUI({ recipeListEl, inventory = [], recipes = RECIPES, onCraft }) {
  let currentInventory = Array.isArray(inventory) ? inventory : [];
  let currentRecipes = Array.isArray(recipes) ? recipes : RECIPES;

  function render() {
    if (!recipeListEl) return;
    recipeListEl.innerHTML = '';
    const inv = currentInventory;

    for (const recipe of currentRecipes) {
      const row = document.createElement('div');
      row.className = 'craft-recipe';

      const outputName = recipe.name ?? getItemDisplayName(recipe.output?.kind);
      const outputCount = recipe.output?.count ?? 1;

      const header = document.createElement('div');
      header.className = 'craft-recipe-header';
      header.textContent = `${outputName} × ${outputCount}`;
      row.appendChild(header);

      const ingredients = document.createElement('div');
      ingredients.className = 'craft-ingredients';
      let canCraft = true;
      for (const input of recipe.inputs ?? []) {
        const need = input.count ?? 1;
        const have = countItem(inv, input.kind);
        const ok = have >= need;
        if (!ok) canCraft = false;
        const span = document.createElement('span');
        span.className = 'craft-ingredient' + (ok ? '' : ' insufficient');
        span.textContent = `${getItemDisplayName(input.kind)}: ${have}/${need}`;
        ingredients.appendChild(span);
      }
      row.appendChild(ingredients);

      const output = document.createElement('div');
      output.className = 'craft-output';
      output.textContent = `→ ${outputName} × ${outputCount}`;
      row.appendChild(output);

      const actions = document.createElement('div');
      actions.className = 'craft-actions';
      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.max = '99';
      countInput.value = '1';
      countInput.className = 'craft-count-input';
      countInput.title = 'Amount to craft';
      const craftBtn = document.createElement('button');
      craftBtn.className = 'craft-btn';
      craftBtn.textContent = 'Craft';
      craftBtn.disabled = !canCraft;
      craftBtn.addEventListener('click', () => {
        const count = Math.max(1, Math.min(99, parseInt(countInput.value, 10) || 1));
        onCraft?.(recipe.id, count);
      });
      actions.appendChild(countInput);
      actions.appendChild(craftBtn);
      row.appendChild(actions);

      recipeListEl.appendChild(row);
    }
  }

  function setInventory(next) {
    currentInventory = Array.isArray(next) ? next : [];
    render();
  }

  function setRecipes(next) {
    currentRecipes = Array.isArray(next) ? next : RECIPES;
    render();
  }

  return {
    render,
    setInventory,
    setRecipes,
  };
}
