export function createInventory(slotCount) {
  const count = Math.max(0, Number(slotCount) || 0);
  return Array.from({ length: count }, () => null);
}

export function countInventory(inventory) {
  if (!Array.isArray(inventory)) return 0;
  return inventory.reduce((total, item) => total + (item?.count ?? 0), 0);
}

/**
 * Returns total count of items with given kind across all slots.
 * @param {Array<{ kind?: string, count?: number } | null>} inventory
 * @param {string} kind
 * @returns {number}
 */
export function countItem(inventory, kind) {
  if (!Array.isArray(inventory) || !kind) return 0;
  return inventory.reduce((total, item) => {
    if (!item || item.kind !== kind) return total;
    return total + (Number(item.count) || 0);
  }, 0);
}

/**
 * Consumes up to `count` items of `kind` from inventory.
 * Returns true if inventory had at least `count` and they were removed; false if insufficient.
 * Does not mutate if returning false.
 * @param {Array<{ kind?: string, count?: number } | null>} inventory
 * @param {string} kind
 * @param {number} count
 * @returns {boolean}
 */
export function consumeItems(inventory, kind, count) {
  if (!Array.isArray(inventory) || !kind || count <= 0) return false;
  const have = countItem(inventory, kind);
  if (have < count) return false;
  let remaining = count;
  for (let i = 0; i < inventory.length && remaining > 0; i += 1) {
    const item = inventory[i];
    if (!item || item.kind !== kind) continue;
    const slotCount = Number(item.count) || 0;
    if (slotCount <= remaining) {
      inventory[i] = null;
      remaining -= slotCount;
    } else {
      item.count = slotCount - remaining;
      remaining = 0;
    }
  }
  return true;
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
