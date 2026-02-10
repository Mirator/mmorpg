import { EQUIP_SLOTS, isItemAllowedInSlot } from '../../shared/equipment.js';

const EQUIP_SLOT_SET = new Set(EQUIP_SLOTS);

function getInventorySlot(inventory, slot) {
  if (!Array.isArray(inventory)) return null;
  if (!Number.isInteger(slot) || slot < 0 || slot >= inventory.length) return null;
  return {
    get value() {
      return inventory[slot];
    },
    set value(next) {
      inventory[slot] = next ?? null;
    },
  };
}

function getEquipmentSlot(equipment, slot) {
  if (!equipment || typeof equipment !== 'object') return null;
  if (typeof slot !== 'string' || !EQUIP_SLOT_SET.has(slot)) return null;
  return {
    get value() {
      return equipment[slot] ?? null;
    },
    set value(next) {
      equipment[slot] = next ?? null;
    },
  };
}

function getSlotRef(type, slot, inventory, equipment) {
  if (type === 'inventory') {
    return getInventorySlot(inventory, slot);
  }
  if (type === 'equipment') {
    return getEquipmentSlot(equipment, slot);
  }
  return null;
}

function canPlaceItem(item, type, slot) {
  if (type === 'inventory') return true;
  if (type === 'equipment') return isItemAllowedInSlot(item, slot);
  return false;
}

export function swapEquipment({ inventory, equipment, fromType, fromSlot, toType, toSlot }) {
  const fromRef = getSlotRef(fromType, fromSlot, inventory, equipment);
  const toRef = getSlotRef(toType, toSlot, inventory, equipment);
  if (!fromRef || !toRef) return false;
  if (fromType === toType && fromSlot === toSlot) return false;

  const fromItem = fromRef.value;
  const toItem = toRef.value;

  if (!canPlaceItem(fromItem, toType, toSlot)) return false;
  if (!canPlaceItem(toItem, fromType, fromSlot)) return false;

  fromRef.value = toItem;
  toRef.value = fromItem;
  return true;
}
