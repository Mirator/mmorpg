// @ts-check
import { swapInventorySlots } from '../../logic/inventory.js';
import { swapEquipment } from '../../logic/equipment.js';
import { addItem, consumeItems } from '../../logic/inventory.js';
import {
  getMissingDurability,
  isDurabilityTrackedItem,
  repairDurability,
} from '../../../shared/equipment.js';
import { getRecipeByOutputKind } from '../../../shared/recipes.js';
import {
  getRepairDiscountMultiplier,
  getSalvageYieldMultiplier,
} from '../../../shared/professions.js';
import { getItemDisplayName } from '../../../shared/economy.js';
import { refreshDeliveryContractProgress } from '../../logic/contracts.js';
import { applyTutorialProgress } from '../../logic/tutorial.js';

export function handleInventorySwap(/** @type {any} */ ctx) {
  const { player, msg, persistence } = ctx;
  const swapped = swapInventorySlots(player.inventory, msg.from, msg.to);
  if (swapped) {
    persistence.markDirty(player);
  }
}

export function handleEquipSwap(/** @type {any} */ ctx) {
  const { player, msg, persistence, countInventory } = ctx;
  const swapped = swapEquipment({
    inventory: player.inventory,
    equipment: player.equipment,
    fromType: msg.fromType,
    fromSlot: msg.fromSlot,
    toType: msg.toType,
    toSlot: msg.toSlot,
  });
  if (swapped) {
    player.inv = countInventory(player.inventory);
    if (msg.fromType === 'equipment' || msg.toType === 'equipment') {
      const tutorialResult = applyTutorialProgress(player, 'equip');
      if (tutorialResult.changed) {
        persistence.markDirty(player);
        return;
      }
    }
    persistence.markDirty(player);
  }
}

function findNearbyVendor(/** @type {any} */ world, /** @type {any} */ player) {
  if (!world?.vendors || !player?.pos) return null;
  const maxDist = world.vendorInteractRadius ?? 2.5;
  for (const vendor of world.vendors) {
    const dist = Math.hypot((player.pos.x ?? 0) - vendor.x, (player.pos.z ?? 0) - vendor.z);
    if (dist <= maxDist) return vendor;
  }
  return null;
}

function getCraftMaterialKind(/** @type {any} */ profession) {
  if (profession === 'smithing') return 'ore';
  if (profession === 'alchemy') return 'crystal';
  if (profession === 'woodcraft') return 'wood';
  return null;
}

export function handleRepairItem(/** @type {any} */ ctx) {
  const { player, msg, world, persistence, countInventory } = ctx;
  if (!findNearbyVendor(world, player)) return;
  const item = msg.fromType === 'equipment'
    ? player.equipment?.[msg.slot]
    : player.inventory?.[msg.slot];
  if (!item || !isDurabilityTrackedItem(item)) return;
  const missing = getMissingDurability(item);
  if (missing <= 0) return;

  const track = item.craftedProfession;
  const repairMultiplier = getRepairDiscountMultiplier(player.professionMasteries, track);
  const copperCost = Math.max(1, Math.floor(missing * 8 * repairMultiplier));
  if ((player.currencyCopper ?? 0) < copperCost) return;

  const materialKind = item.rarity === 'rare' ? getCraftMaterialKind(track) : null;
  if (materialKind && !consumeItems(player.inventory, materialKind, 1)) {
    return;
  }

  if (!repairDurability(item)) {
    if (materialKind) {
      addItem(player.inventory, {
        kind: materialKind,
        name: getItemDisplayName(materialKind),
        count: 1,
      }, player.invStackMax ?? 20);
    }
    return;
  }

  player.currencyCopper = Math.max(0, (player.currencyCopper ?? 0) - copperCost);
  player.inv = countInventory(player.inventory);
  refreshDeliveryContractProgress(player);
  persistence.markDirty(player);
}

export function handleSalvageItem(/** @type {any} */ ctx) {
  const { player, msg, persistence, countInventory, nextItemIdRef } = ctx;
  if (!Array.isArray(player.inventory)) return;
  if (msg.slot < 0 || msg.slot >= player.inventory.length) return;
  const item = player.inventory[msg.slot];
  if (!item || !isDurabilityTrackedItem(item)) return;
  const recipe = getRecipeByOutputKind(item.kind);
  if (!recipe || !recipe.profession) return;

  player.inventory[msg.slot] = null;
  const yieldMultiplier = getSalvageYieldMultiplier(player.professionMasteries, recipe.profession);
  for (const input of recipe.inputs) {
    const outputCount = Math.max(1, Math.floor(input.count * yieldMultiplier));
    addItem(player.inventory, {
      id: `i${nextItemIdRef.current++}`,
      kind: input.kind,
      name: getItemDisplayName(input.kind),
      count: outputCount,
    }, player.invStackMax ?? 20);
  }
  player.inv = countInventory(player.inventory);
  refreshDeliveryContractProgress(player);
  persistence.markDirty(player);
}
