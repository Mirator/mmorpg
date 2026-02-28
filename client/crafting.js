// @ts-check
import { RECIPES } from '/shared/recipes.js';
import { getItemDisplayName } from '/shared/economy.js';
import {
  getStationKindsForType,
  STATION_INTERACT_RADIUS,
} from '/shared/professions.js';
import { getItemIconFile } from './gameIcons.js';
import { createGlyphElement } from './uiGlyphs.js';

/** @typedef {import('/shared/recipes.js').Recipe} Recipe */

/**
 * @param {Array<{ kind?: string, count?: number } | null>} inventory
 * @param {string} kind
 * @returns {number}
 */
function countItem(inventory, kind) {
  if (!Array.isArray(inventory) || !kind) return 0;
  return inventory.reduce((/** @type {any} */ total, /** @type {any} */ item) => {
    if (!item || item.kind !== kind) return total;
    return total + (Number(item.count) || 0);
  }, 0);
}

function appendKindGlyph(
  /** @type {HTMLElement} */ parent,
  /** @type {any} */ kind,
  /** @type {any} */ label,
  /** @type {string} */ className
) {
  const iconFile = getItemIconFile(kind);
  if (!iconFile) return;
  parent.appendChild(
    createGlyphElement(iconFile, {
      className,
      label,
    })
  );
}

function formatTrackLabel(/** @type {string | undefined} */ track) {
  if (!track) return 'Crafting';
  return track.charAt(0).toUpperCase() + track.slice(1);
}

function formatStationLabel(/** @type {string | null | undefined} */ stationType) {
  if (!stationType) return 'Portable';
  return stationType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function hasNearbyStation(
  /** @type {Recipe} */ recipe,
  /** @type {{ playerPos?: { x?: number, z?: number } | null, worldConfig?: any } | null} */ context
) {
  if (!recipe.stationType) return true;
  const playerPos = context?.playerPos;
  const structures = Array.isArray(context?.worldConfig?.structures) ? context.worldConfig.structures : [];
  if (!playerPos || structures.length === 0) return false;
  const validKinds = new Set(getStationKindsForType(recipe.stationType));
  for (const structure of structures) {
    if (!structure || !validKinds.has(structure.kind)) continue;
    const distance = Math.hypot(
      (Number(playerPos.x) || 0) - (Number(structure.x) || 0),
      (Number(playerPos.z) || 0) - (Number(structure.z) || 0)
    );
    if (distance <= STATION_INTERACT_RADIUS) {
      return true;
    }
  }
  return false;
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
  let currentContext = { playerPos: null, worldConfig: null };

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
      appendKindGlyph(
        header,
        recipe.output?.kind,
        outputName,
        'ui-glyph ui-glyph-md craft-recipe-glyph'
      );
      const headerText = document.createElement('span');
      headerText.textContent = `${outputName} × ${outputCount}`;
      header.appendChild(headerText);
      row.appendChild(header);

      const meta = document.createElement('div');
      meta.className = 'craft-recipe-meta';
      meta.textContent = recipe.profession
        ? `${formatTrackLabel(recipe.profession)} recipe`
        : 'Portable recipe';
      row.appendChild(meta);

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
        const inputName = getItemDisplayName(input.kind);
        appendKindGlyph(
          span,
          input.kind,
          inputName,
          'ui-glyph ui-glyph-sm craft-ingredient-glyph'
        );
        const ingredientText = document.createElement('span');
        ingredientText.textContent = `${inputName}: ${have}/${need}`;
        span.appendChild(ingredientText);
        ingredients.appendChild(span);
      }
      row.appendChild(ingredients);

      const requirements = document.createElement('div');
      requirements.className = 'craft-requirements';
      if (recipe.stationType) {
        const nearbyStation = hasNearbyStation(recipe, currentContext);
        if (!nearbyStation) canCraft = false;
        const stationBadge = document.createElement('span');
        stationBadge.className = `craft-requirement${nearbyStation ? '' : ' insufficient'}`;
        stationBadge.textContent = nearbyStation
          ? `${formatStationLabel(recipe.stationType)} nearby`
          : `${formatStationLabel(recipe.stationType)} required`;
        requirements.appendChild(stationBadge);
      } else {
        const portableBadge = document.createElement('span');
        portableBadge.className = 'craft-requirement';
        portableBadge.textContent = 'Portable';
        requirements.appendChild(portableBadge);
      }
      if (recipe.profession && Number.isFinite(recipe.masteryLevelRequired)) {
        const masteryBadge = document.createElement('span');
        masteryBadge.className = 'craft-requirement';
        masteryBadge.textContent = `${formatTrackLabel(recipe.profession)} Lv. ${recipe.masteryLevelRequired}`;
        requirements.appendChild(masteryBadge);
      }
      row.appendChild(requirements);

      const output = document.createElement('div');
      output.className = 'craft-output';
      appendKindGlyph(
        output,
        recipe.output?.kind,
        outputName,
        'ui-glyph ui-glyph-sm craft-output-glyph'
      );
      const outputText = document.createElement('span');
      outputText.textContent = `→ ${outputName} × ${outputCount}`;
      output.appendChild(outputText);
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

  function setInventory(/** @type {any} */ next) {
    currentInventory = Array.isArray(next) ? next : [];
    render();
  }

  function setRecipes(/** @type {any} */ next) {
    currentRecipes = Array.isArray(next) ? next : RECIPES;
    render();
  }

  function setContext(/** @type {any} */ next) {
    currentContext = {
      playerPos: next?.playerPos ?? null,
      worldConfig: next?.worldConfig ?? null,
    };
    render();
  }

  return {
    render,
    setInventory,
    setRecipes,
    setContext,
  };
}
