export function createInventory(slotCount) {
  const count = Math.max(0, Number(slotCount) || 0);
  return Array.from({ length: count }, () => null);
}

export function countInventory(inventory) {
  if (!Array.isArray(inventory)) return 0;
  return inventory.reduce((total, item) => total + (item?.count ?? 0), 0);
}

export function canAddItem(inventory, kind, stackMax = 1) {
  if (!Array.isArray(inventory)) return false;
  const max = Math.max(1, Number(stackMax) || 1);
  for (const slot of inventory) {
    if (!slot) return true;
    if (slot.kind === kind && (slot.count ?? 0) < max) return true;
  }
  return false;
}

export function addItem(inventory, item, stackMax = 1) {
  if (!Array.isArray(inventory)) return false;
  const max = Math.max(1, Number(stackMax) || 1);
  const kind = item?.kind;
  if (!kind) return false;

  let remaining = Math.max(1, Number(item.count) || 1);

  for (const slot of inventory) {
    if (!slot) continue;
    if (slot.kind !== kind) continue;
    const current = Number(slot.count) || 0;
    if (current >= max) continue;
    const add = Math.min(max - current, remaining);
    slot.count = current + add;
    remaining -= add;
    if (remaining <= 0) return true;
  }

  for (let i = 0; i < inventory.length; i += 1) {
    if (inventory[i]) continue;
    const add = Math.min(max, remaining);
    inventory[i] = { ...item, count: add };
    remaining -= add;
    if (remaining <= 0) return true;
  }

  return false;
}

export function clearInventory(inventory) {
  if (!Array.isArray(inventory)) return;
  for (let i = 0; i < inventory.length; i += 1) {
    inventory[i] = null;
  }
}

export function swapInventorySlots(inventory, from, to) {
  if (!Array.isArray(inventory)) return false;
  const max = inventory.length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
  if (from < 0 || to < 0 || from >= max || to >= max) return false;
  if (from === to) return false;
  const temp = inventory[from];
  inventory[from] = inventory[to];
  inventory[to] = temp;
  return true;
}
