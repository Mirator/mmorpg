// @ts-check

import { MOB_LOOT_TABLES } from '../../shared/lootTables.js';
import { getItemDisplayName } from '../../shared/economy.js';
import { createWeaponItem, getWeaponDef } from '../../shared/equipment.js';
import { addItem } from './inventory.js';
import { countInventory } from './inventory.js';

/**
 * Roll loot for a mob kill and grant to the recipient.
 * @param {any} mob - Dead mob with mobType
 * @param {any} recipient - Player to receive loot
 * @param {{ current: number }} nextItemIdRef - Mutable ref for item IDs
 * @param {Function} [rand] - Random function 0-1
 * @param {number} [stackMax] - Max stack size for recipient
 * @returns {Array<{ kind: string, count: number }>} Granted loot (for logging)
 */
export function rollAndGrantLoot(mob, recipient, nextItemIdRef, rand = Math.random, stackMax = 20) {
  const table = MOB_LOOT_TABLES[mob?.mobType];
  if (!Array.isArray(table) || table.length === 0) return [];

  const granted = [];
  const inv = recipient?.inventory;
  if (!Array.isArray(inv)) return [];

  for (const entry of table) {
    if (!entry?.kind || (entry.chancePct ?? 0) <= 0) continue;
    if (rand() * 100 >= (entry.chancePct ?? 0)) continue;

    const minC = Math.max(0, Math.floor(entry.minCount ?? 0));
    const maxC = Math.max(minC, Math.floor(entry.maxCount ?? 1));
    const count = minC + Math.floor(rand() * (maxC - minC + 1));
    if (count <= 0) continue;

    const weaponDef = getWeaponDef(entry.kind);
    let item;
    if (weaponDef) {
      item = createWeaponItem(entry.kind);
      if (!item) continue;
      item.id = `i${nextItemIdRef.current++}`;
      item.count = count;
    } else {
      item = {
        id: `i${nextItemIdRef.current++}`,
        kind: entry.kind,
        name: getItemDisplayName(entry.kind) ?? entry.kind,
        count,
      };
    }

    if (addItem(inv, item, stackMax)) {
      granted.push({ kind: entry.kind, count });
    }
  }

  if (granted.length > 0) {
    recipient.inv = countInventory(inv);
  }

  return granted;
}
