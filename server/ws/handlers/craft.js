// @ts-check
import { getItemDisplayName } from '../../../shared/economy.js';
import {
  getRecipeById,
  isRecipeKnown,
} from '../../../shared/recipes.js';
import { getWeaponDef } from '../../../shared/equipment.js';
import {
  createWeaponItem,
  DURABILITY_BY_RARITY,
} from '../../../shared/equipment.js';
import {
  addItem,
  consumeItems,
  countItem,
} from '../../logic/inventory.js';
import { countInventory } from '../../logic/inventory.js';
import {
  STATION_INTERACT_RADIUS,
  getStationKindsForType,
} from '../../../shared/professions.js';
import {
  applyContractProgress,
  applyProfessionReward,
  refreshDeliveryContractProgress,
} from '../../logic/contracts.js';

function isNearRequiredStation(/** @type {any} */ player, /** @type {any} */ world, /** @type {any} */ stationType) {
  if (!stationType) return true;
  if (!player?.pos || !Array.isArray(world?.structures)) return false;
  const allowedKinds = new Set(getStationKindsForType(stationType));
  if (allowedKinds.size === 0) return false;
  for (const structure of world.structures) {
    if (!allowedKinds.has(structure.kind)) continue;
    const dist = Math.hypot(
      (player.pos.x ?? 0) - (structure.x ?? 0),
      (player.pos.z ?? 0) - (structure.z ?? 0)
    );
    if (dist <= STATION_INTERACT_RADIUS) {
      return true;
    }
  }
  return false;
}

export function handleCraft(/** @type {any} */ ctx) {
  const { player, msg, persistence, nextItemIdRef, world, safeSend, ws } = ctx;
  const recipe = getRecipeById(msg.recipeId);
  if (!recipe) return;
  if (!isRecipeKnown(recipe.id, player.knownRecipes)) return;
  if (!isNearRequiredStation(player, world, recipe.stationType)) return;
  const craftCount = msg.count ?? 1;
  for (const input of recipe.inputs) {
    const need = input.count * craftCount;
    if (countItem(player.inventory, input.kind) < need) return;
  }
  const /** @type {any} */ consumed = [];
  for (const input of recipe.inputs) {
    const need = input.count * craftCount;
    if (!consumeItems(player.inventory, input.kind, need)) {
      for (const c of consumed) {
        addItem(player.inventory, c, player.invStackMax ?? 20);
      }
      return;
    }
    consumed.push({
      id: `i${nextItemIdRef.current++}`,
      kind: input.kind,
      name: getItemDisplayName(input.kind),
      count: need,
    });
  }
  const outputKind = recipe.output.kind;
  const outputCount = (recipe.output.count ?? 1) * craftCount;
  const weaponDef = getWeaponDef(outputKind);
  const tracksDurability = !!recipe.profession && ['weapon', 'armor', 'offhand'].includes(recipe.category ?? '');
  const maxDurability = tracksDurability
    ? (DURABILITY_BY_RARITY[recipe.outputRarity ?? 'common'] ?? DURABILITY_BY_RARITY.common)
    : undefined;
  let outputItem;
  if (weaponDef) {
    outputItem = createWeaponItem(outputKind, {
      ...(recipe.portable === true ? { isStarter: true } : {}),
      ...(tracksDurability
        ? {
            rarity: recipe.outputRarity ?? 'common',
            maxDurability,
            durability: maxDurability,
            craftedProfession: recipe.profession,
            sourceRecipeId: recipe.id,
          }
        : {}),
    });
    if (!outputItem) {
      for (const c of consumed) {
        addItem(player.inventory, c, player.invStackMax ?? 20);
      }
      return;
    }
    outputItem.count = outputCount;
  } else {
    outputItem = {
      id: `i${nextItemIdRef.current++}`,
      kind: outputKind,
      name: recipe.name ?? getItemDisplayName(outputKind),
      count: outputCount,
      ...(tracksDurability
        ? {
            rarity: recipe.outputRarity ?? 'common',
            maxDurability,
            durability: maxDurability,
            craftedProfession: recipe.profession,
            sourceRecipeId: recipe.id,
          }
        : {}),
    };
  }
  const stackMax = player.invStackMax ?? 20;
  if (!addItem(player.inventory, outputItem, stackMax)) {
    for (const c of consumed) {
      addItem(player.inventory, c, stackMax);
    }
    return;
  }
  player.inv = countInventory(player.inventory);
  if (recipe.profession) {
    const masteryResult = applyProfessionReward(player, [
      { track: recipe.profession, xp: 25 * craftCount },
    ]);
    if (Object.keys(masteryResult.masteryResults).length > 0) {
      safeSend(ws, {
        type: 'masteryUpdated',
        professionMasteries: masteryResult.professionMasteries,
        unlockedRecipeIds: masteryResult.unlockedRecipeIds,
      });
    }
  }
  applyContractProgress(player, {
    kind: 'craft',
    target: recipe.id,
    count: craftCount,
  });
  refreshDeliveryContractProgress(player);
  persistence.markDirty(player);
}
