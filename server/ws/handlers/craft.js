import { getItemDisplayName } from '../../../shared/economy.js';
import { getRecipeById } from '../../../shared/recipes.js';
import { getWeaponDef } from '../../../shared/equipment.js';
import { createWeaponItem } from '../../../shared/equipment.js';
import {
  addItem,
  consumeItems,
  countItem,
} from '../../logic/inventory.js';
import { countInventory } from '../../logic/inventory.js';

export function handleCraft(ctx) {
  const { player, msg, persistence, nextItemIdRef } = ctx;
  const recipe = getRecipeById(msg.recipeId);
  if (!recipe) return;
  const craftCount = msg.count ?? 1;
  for (const input of recipe.inputs) {
    const need = input.count * craftCount;
    if (countItem(player.inventory, input.kind) < need) return;
  }
  const consumed = [];
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
  let outputItem;
  if (weaponDef) {
    outputItem = createWeaponItem(outputKind);
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
      name: getItemDisplayName(outputKind),
      count: outputCount,
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
  persistence.markDirty(player);
}
