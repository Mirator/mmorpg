import { swapInventorySlots } from '../../logic/inventory.js';
import { swapEquipment } from '../../logic/equipment.js';

export function handleInventorySwap(ctx) {
  const { player, msg, persistence } = ctx;
  const swapped = swapInventorySlots(player.inventory, msg.from, msg.to);
  if (swapped) {
    persistence.markDirty(player);
  }
}

export function handleEquipSwap(ctx) {
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
    persistence.markDirty(player);
  }
}
