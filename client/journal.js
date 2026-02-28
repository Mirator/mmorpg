// @ts-check

import { getRecipeById } from '/shared/recipes.js';
import { getItemDisplayName } from '/shared/economy.js';
import {
  getMissingDurability,
  isDurabilityTrackedItem,
} from '/shared/equipment.js';
import { PROFESSION_TRACKS, professionXpToNext } from '/shared/professions.js';

function formatTrackName(/** @type {string} */ track) {
  return track.charAt(0).toUpperCase() + track.slice(1);
}

function renderProgressText(/** @type {any} */ contract) {
  const required = contract.requiredCount ?? 1;
  const progress = Math.min(required, contract.progress ?? 0);
  if (contract.completed) {
    return contract.delivered ? 'Completed' : `Turn in (${progress}/${required})`;
  }
  return `${progress}/${required}`;
}

export function createJournalUI(/** @type {any} */ {
  journalRootEl,
  onContractAbandon,
  onContractTurnIn,
  onRepairItem,
  onSalvageItem,
}) {
  let /** @type {any} */ currentMe = null;

  function renderContracts() {
    const section = document.createElement('section');
    section.className = 'journal-section';
    const title = document.createElement('h3');
    title.className = 'journal-title';
    title.textContent = 'Active Contracts';
    section.appendChild(title);

    const activeContracts = Array.isArray(currentMe?.activeContracts) ? currentMe.activeContracts : [];
    if (activeContracts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'journal-empty';
      empty.textContent = 'No active contracts.';
      section.appendChild(empty);
      return section;
    }

    for (const contract of activeContracts) {
      const row = document.createElement('div');
      row.className = 'journal-row';
      const meta = document.createElement('div');
      meta.className = 'journal-meta';
      const label = document.createElement('div');
      label.className = 'journal-label';
      label.textContent = contract.title ?? contract.contractId ?? 'Contract';
      const progress = document.createElement('div');
      progress.className = 'journal-subtle';
      progress.textContent = renderProgressText(contract);
      meta.appendChild(label);
      meta.appendChild(progress);
      row.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'journal-actions';
      if (contract.completed) {
        const turnInBtn = document.createElement('button');
        turnInBtn.type = 'button';
        turnInBtn.className = 'journal-btn';
        turnInBtn.textContent = 'Turn In';
        turnInBtn.addEventListener('click', () => {
          onContractTurnIn?.(contract.vendorId, contract.contractId ?? contract.templateId);
        });
        actions.appendChild(turnInBtn);
      }
      const abandonBtn = document.createElement('button');
      abandonBtn.type = 'button';
      abandonBtn.className = 'journal-btn ghost';
      abandonBtn.textContent = 'Abandon';
      abandonBtn.addEventListener('click', () => {
        onContractAbandon?.(contract.contractId ?? contract.templateId);
      });
      actions.appendChild(abandonBtn);
      row.appendChild(actions);
      section.appendChild(row);
    }

    return section;
  }

  function renderMasteries() {
    const section = document.createElement('section');
    section.className = 'journal-section';
    const title = document.createElement('h3');
    title.className = 'journal-title';
    title.textContent = 'Profession Masteries';
    section.appendChild(title);

    const masteries = currentMe?.professionMasteries ?? {};
    for (const track of PROFESSION_TRACKS) {
      const state = masteries?.[track] ?? { level: 1, xp: 0 };
      const needed = professionXpToNext(state.level);
      const row = document.createElement('div');
      row.className = 'journal-row stacked';
      const label = document.createElement('div');
      label.className = 'journal-label';
      label.textContent = `${formatTrackName(track)} Lv. ${state.level ?? 1}`;
      const progress = document.createElement('div');
      progress.className = 'journal-bar';
      const fill = document.createElement('div');
      fill.className = 'journal-bar-fill';
      const pct = needed > 0 ? Math.min(100, ((state.xp ?? 0) / needed) * 100) : 100;
      fill.style.width = `${pct}%`;
      progress.appendChild(fill);
      const value = document.createElement('div');
      value.className = 'journal-subtle';
      value.textContent = needed > 0 ? `${state.xp ?? 0}/${needed}` : 'MAX';
      row.appendChild(label);
      row.appendChild(progress);
      row.appendChild(value);
      section.appendChild(row);
    }

    return section;
  }

  function renderKnownRecipes() {
    const section = document.createElement('section');
    section.className = 'journal-section';
    const title = document.createElement('h3');
    title.className = 'journal-title';
    title.textContent = 'Known Recipes';
    section.appendChild(title);
    const recipeIds = Array.isArray(currentMe?.knownRecipes) ? currentMe.knownRecipes : [];
    if (recipeIds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'journal-empty';
      empty.textContent = 'No recipes discovered.';
      section.appendChild(empty);
      return section;
    }
    for (const recipeId of recipeIds) {
      const recipe = getRecipeById(recipeId);
      if (!recipe) continue;
      const row = document.createElement('div');
      row.className = 'journal-row';
      const label = document.createElement('div');
      label.className = 'journal-label';
      label.textContent = recipe.name ?? getItemDisplayName(recipe.output?.kind);
      const meta = document.createElement('div');
      meta.className = 'journal-subtle';
      meta.textContent = recipe.stationType
        ? `${formatTrackName(recipe.profession ?? 'crafting')} · ${recipe.stationType.replace('_', ' ')}`
        : 'Portable';
      row.appendChild(label);
      row.appendChild(meta);
      section.appendChild(row);
    }
    return section;
  }

  function renderMaintenance() {
    const section = document.createElement('section');
    section.className = 'journal-section';
    const title = document.createElement('h3');
    title.className = 'journal-title';
    title.textContent = 'Maintenance';
    section.appendChild(title);

    const repairEntries = [];
    const equipment = currentMe?.equipment ?? {};
    for (const slot of ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet']) {
      const item = equipment?.[slot];
      if (!item || !isDurabilityTrackedItem(item) || getMissingDurability(item) <= 0) continue;
      repairEntries.push({ item, fromType: 'equipment', slot });
    }
    const inventory = Array.isArray(currentMe?.inventory) ? currentMe.inventory : [];
    for (let index = 0; index < inventory.length; index += 1) {
      const item = inventory[index];
      if (!item || !isDurabilityTrackedItem(item)) continue;
      repairEntries.push({ item, fromType: 'inventory', slot: index });
    }

    if (repairEntries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'journal-empty';
      empty.textContent = 'No crafted gear to repair or salvage.';
      section.appendChild(empty);
      return section;
    }

    for (const entry of repairEntries) {
      const row = document.createElement('div');
      row.className = 'journal-row';
      const meta = document.createElement('div');
      meta.className = 'journal-meta';
      const label = document.createElement('div');
      label.className = 'journal-label';
      label.textContent = entry.item.name ?? getItemDisplayName(entry.item.kind);
      const detail = document.createElement('div');
      detail.className = 'journal-subtle';
      detail.textContent = `Durability ${entry.item.durability ?? 0}/${entry.item.maxDurability ?? 0}`;
      meta.appendChild(label);
      meta.appendChild(detail);
      row.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'journal-actions';
      if (getMissingDurability(entry.item) > 0) {
        const repairBtn = document.createElement('button');
        repairBtn.type = 'button';
        repairBtn.className = 'journal-btn';
        repairBtn.textContent = 'Repair';
        repairBtn.addEventListener('click', () => {
          onRepairItem?.(entry.fromType, entry.slot);
        });
        actions.appendChild(repairBtn);
      }
      if (entry.fromType === 'inventory') {
        const salvageBtn = document.createElement('button');
        salvageBtn.type = 'button';
        salvageBtn.className = 'journal-btn ghost';
        salvageBtn.textContent = 'Salvage';
        salvageBtn.addEventListener('click', () => {
          onSalvageItem?.(entry.slot);
        });
        actions.appendChild(salvageBtn);
      }
      row.appendChild(actions);
      section.appendChild(row);
    }

    return section;
  }

  function render() {
    if (!journalRootEl) return;
    journalRootEl.innerHTML = '';
    journalRootEl.appendChild(renderContracts());
    journalRootEl.appendChild(renderMasteries());
    journalRootEl.appendChild(renderKnownRecipes());
    journalRootEl.appendChild(renderMaintenance());
  }

  function setState(/** @type {any} */ nextMe) {
    currentMe = nextMe ?? null;
    render();
  }

  return {
    render,
    setState,
  };
}
