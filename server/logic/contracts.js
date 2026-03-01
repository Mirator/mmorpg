// @ts-check

import {
  createActiveContracts,
  CONTRACT_BONUS_DAILY,
  DAILY_COMMISSION_RESET_MS,
  getContractOfferForPlayer,
  getContractSnapshotForPlayer,
  getContractTemplateById,
  MAX_ACTIVE_CONTRACTS,
} from '../../shared/contracts.js';
import { addXp } from '../../shared/progression.js';
import {
  addProfessionXp,
  createProfessionMasteries,
} from '../../shared/professions.js';
import { getDefaultKnownRecipeIds, getUnlockedRecipeIdsForMasteries } from '../../shared/recipes.js';
import { getItemDisplayName } from '../../shared/economy.js';
import { addItem, countInventory, countItem, consumeItems } from './inventory.js';
import { computeDerivedStats } from '../../shared/attributes.js';
import { getResourceForClass } from '../../shared/classes.js';

function syncDerivedStatsOnLevelUp(/** @type {any} */ player, /** @type {boolean} */ leveledUp) {
  if (!leveledUp) return;
  const derived = computeDerivedStats(player);
  player.maxHp = derived.maxHp;
  if (player.hp > derived.maxHp) {
    player.hp = derived.maxHp;
  }
  const resourceDef = getResourceForClass(player.classId);
  if (resourceDef?.type === 'mana') {
    player.resourceMax = derived.maxMana;
    player.resource = Math.min(player.resource ?? 0, derived.maxMana);
  }
}

function setPendingStateDirty(/** @type {any} */ player) {
  if (!player) return;
  player.pendingProgressDirty = true;
}

export function syncKnownRecipes(/** @type {any} */ player) {
  if (!player) return [];
  const currentKnown = Array.isArray(player.knownRecipes)
    ? new Set(player.knownRecipes.filter((/** @type {any} */ id) => typeof id === 'string'))
    : new Set(getDefaultKnownRecipeIds());
  const unlocked = getUnlockedRecipeIdsForMasteries(player.professionMasteries);
  const /** @type {string[]} */ newlyUnlocked = [];
  for (const recipeId of unlocked) {
    if (!currentKnown.has(recipeId)) {
      currentKnown.add(recipeId);
      newlyUnlocked.push(recipeId);
    }
  }
  player.knownRecipes = Array.from(currentKnown);
  return newlyUnlocked;
}

export function refreshDeliveryContractProgress(/** @type {any} */ player) {
  if (!player) return false;
  let changed = false;
  const activeContracts = createActiveContracts(player.activeContracts);
  for (const entry of activeContracts) {
    const template = getContractTemplateById(entry.templateId);
    if (!template || template.kind !== 'delivery') continue;
    const currentCount = countItem(player.inventory, template.deliveryItemKind ?? '');
    const nextProgress = Math.min(template.deliveryItemCount ?? template.requiredCount, currentCount);
    if (entry.progress !== nextProgress || entry.completed !== (nextProgress >= (template.deliveryItemCount ?? template.requiredCount))) {
      entry.progress = nextProgress;
      entry.completed = nextProgress >= (template.deliveryItemCount ?? template.requiredCount);
      changed = true;
    }
  }
  if (changed) {
    player.activeContracts = activeContracts;
    setPendingStateDirty(player);
  }
  return changed;
}

export function getContractSyncPayload(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
  refreshDeliveryContractProgress(player);
  return getContractSnapshotForPlayer(player, now);
}

export function applyProfessionReward(/** @type {any} */ player, /** @type {any} */ rewards) {
  player.professionMasteries = createProfessionMasteries(player.professionMasteries);
  const /** @type {Record<string, { level: number, xp: number }>} */ masteryResults = {};
  let /** @type {string[]} */ unlockedRecipeIds = [];
  for (const entry of rewards ?? []) {
    if (!entry || entry.xp <= 0) continue;
    const result = addProfessionXp(player.professionMasteries, entry.track, entry.xp);
    player.professionMasteries = result.masteries;
    masteryResults[entry.track] = player.professionMasteries[entry.track];
    if (result.leveledUp) {
      unlockedRecipeIds = unlockedRecipeIds.concat(syncKnownRecipes(player));
    }
  }
  return {
    professionMasteries: player.professionMasteries,
    masteryResults,
    unlockedRecipeIds: Array.from(new Set(unlockedRecipeIds)),
  };
}

export function acceptContract(/** @type {any} */ player, /** @type {any} */ vendorId, /** @type {any} */ contractId, /** @type {any} */ now = Date.now()) {
  const template = getContractTemplateById(contractId);
  if (!player || !template) {
    return { ok: false, error: 'unknown_contract' };
  }
  const offer = getContractOfferForPlayer(player, vendorId, contractId, now);
  if (!offer) {
    return { ok: false, error: 'contract_unavailable' };
  }
  const activeContracts = createActiveContracts(player.activeContracts);
  if (activeContracts.length >= MAX_ACTIVE_CONTRACTS) {
    return { ok: false, error: 'contract_limit' };
  }
  if (activeContracts.some((entry) => entry.templateId === template.id && entry.delivered !== true)) {
    return { ok: false, error: 'contract_already_active' };
  }
  const progress = template.kind === 'delivery'
    ? Math.min(
        Number(template.deliveryItemCount ?? template.requiredCount ?? 0),
        countItem(player.inventory, template.deliveryItemKind ?? '')
      )
    : 0;
  activeContracts.push({
    templateId: template.id,
    vendorId,
    acceptedAt: Number.isFinite(now) ? now : Date.now(),
    progress,
    completed: progress >= Number(template.deliveryItemCount ?? template.requiredCount ?? 0),
    delivered: false,
    ...(offer?.bonusType === CONTRACT_BONUS_DAILY ? { bonusType: CONTRACT_BONUS_DAILY } : {}),
    ...(Number.isFinite(offer?.resetAt) ? { resetAt: Math.max(0, Math.floor(Number(offer.resetAt))) } : {}),
  });
  player.activeContracts = activeContracts;
  setPendingStateDirty(player);
  return { ok: true };
}

export function abandonContract(/** @type {any} */ player, /** @type {any} */ contractId) {
  if (!player || typeof contractId !== 'string') {
    return { ok: false, error: 'unknown_contract' };
  }
  const activeContracts = createActiveContracts(player.activeContracts);
  const next = activeContracts.filter((entry) => entry.templateId !== contractId);
  if (next.length === activeContracts.length) {
    return { ok: false, error: 'contract_not_active' };
  }
  player.activeContracts = next;
  setPendingStateDirty(player);
  return { ok: true };
}

export function applyContractProgress(/** @type {any} */ player, /** @type {any} */ progressEvent) {
  if (!player || !progressEvent) return { changed: false, completedIds: [] };
  const activeContracts = createActiveContracts(player.activeContracts);
  let changed = false;
  const /** @type {string[]} */ completedIds = [];
  for (const entry of activeContracts) {
    const template = getContractTemplateById(entry.templateId);
    if (!template || entry.delivered) continue;
    if (template.kind !== progressEvent.kind) continue;
    if (template.target !== progressEvent.target) continue;
    const required = template.requiredCount;
    const nextProgress = Math.min(required, (entry.progress ?? 0) + Math.max(1, Math.floor(progressEvent.count ?? 1)));
    if (nextProgress !== entry.progress) {
      entry.progress = nextProgress;
      changed = true;
    }
    if (!entry.completed && nextProgress >= required) {
      entry.completed = true;
      completedIds.push(template.id);
      changed = true;
    }
  }
  if (changed) {
    player.activeContracts = activeContracts;
    setPendingStateDirty(player);
  }
  return { changed, completedIds };
}

export function turnInContract(/** @type {any} */ player, /** @type {any} */ vendorId, /** @type {any} */ contractId, /** @type {any} */ now = Date.now()) {
  if (!player || typeof contractId !== 'string') {
    return { ok: false, error: 'unknown_contract' };
  }
  const activeContracts = createActiveContracts(player.activeContracts);
  const entry = activeContracts.find((contract) => contract.templateId === contractId && contract.delivered !== true);
  if (!entry) {
    return { ok: false, error: 'contract_not_active' };
  }
  const template = getContractTemplateById(entry.templateId);
  if (!template) {
    return { ok: false, error: 'unknown_contract' };
  }
  if (entry.vendorId !== vendorId) {
    return { ok: false, error: 'wrong_vendor' };
  }

  if (template.kind === 'delivery') {
    const need = template.deliveryItemCount ?? template.requiredCount;
    if (countItem(player.inventory, template.deliveryItemKind ?? '') < need) {
      refreshDeliveryContractProgress(player);
      return { ok: false, error: 'missing_items' };
    }
    if (!consumeItems(player.inventory, template.deliveryItemKind ?? '', need)) {
      return { ok: false, error: 'missing_items' };
    }
    player.inv = countInventory(player.inventory);
    entry.progress = need;
    entry.completed = true;
  }

  if (!entry.completed) {
    return { ok: false, error: 'contract_incomplete' };
  }

  let rewardXp = template.rewardXp ?? 0;
  let rewardCopper = template.rewardCopper ?? 0;
  let grantedDailyConsumable = false;
  if (entry.bonusType === CONTRACT_BONUS_DAILY) {
    rewardXp = Math.floor(rewardXp * 2);
    rewardCopper = Math.floor(rewardCopper * 1.25);
  }

  const beforeLevel = player.level ?? 1;
  const xpResult = addXp({ level: player.level ?? 1, xp: player.xp ?? 0 }, rewardXp);
  player.level = xpResult.level;
  player.xp = xpResult.xp;
  const leveledUp = xpResult.level > beforeLevel;
  syncDerivedStatsOnLevelUp(player, leveledUp);
  player.currencyCopper = (player.currencyCopper ?? 0) + rewardCopper;
  const masteryReward = applyProfessionReward(player, template.rewardMastery ?? []);
  if (entry.bonusType === CONTRACT_BONUS_DAILY) {
    player.dailyCommissionClaimedAt = Number.isFinite(now) ? Math.floor(now) : Date.now();
    grantedDailyConsumable = addItem(
      player.inventory,
      {
        kind: 'consumable_minor_health_potion',
        name: getItemDisplayName('consumable_minor_health_potion'),
        count: 1,
        isStarter: true,
      },
      player.invStackMax ?? 20
    );
    player.inv = countInventory(player.inventory);
    if (!Number.isFinite(entry.resetAt)) {
      entry.resetAt = (Number.isFinite(now) ? Math.floor(now) : Date.now()) + DAILY_COMMISSION_RESET_MS;
    }
  }
  entry.delivered = true;
  player.activeContracts = activeContracts.filter((contract) => contract.delivered !== true);
  setPendingStateDirty(player);
  refreshDeliveryContractProgress(player);

  return {
    ok: true,
    rewards: {
      xp: rewardXp,
      copper: rewardCopper,
      leveledUp,
      professionMasteries: masteryReward.professionMasteries,
      unlockedRecipeIds: masteryReward.unlockedRecipeIds,
      ...(entry.bonusType === CONTRACT_BONUS_DAILY ? { bonusType: CONTRACT_BONUS_DAILY } : {}),
      ...(entry.bonusType === CONTRACT_BONUS_DAILY ? { grantedDailyConsumable } : {}),
    },
  };
}
