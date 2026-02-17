// @ts-check
import { addItem, countInventory } from './inventory.js';

/** @typedef {import('../types/domain.d.ts').Corpse} Corpse */
/** @typedef {import('../types/domain.d.ts').Inventory} Inventory */
/** @typedef {import('../types/domain.d.ts').Position3D} Position3D */
/** @typedef {import('../types/domain.d.ts').ServerPlayer} ServerPlayer */

let nextCorpseId = 1;

/**
 * @param {Position3D | null | undefined} a
 * @param {Position3D | null | undefined} b
 * @returns {number}
 */
function distance2(a, b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dz = (a?.z ?? 0) - (b?.z ?? 0);
  return dx * dx + dz * dz;
}

/**
 * Deep-copy inventory slots (items) for corpse storage.
 * @param {Inventory} inventory
 * @returns {Inventory}
 */
function copyInventoryForCorpse(inventory) {
  if (!Array.isArray(inventory)) return [];
  return inventory.map((slot) => {
    if (!slot) return null;
    return {
      id: slot.id,
      kind: slot.kind,
      name: slot.name,
      count: slot.count ?? 1,
    };
  });
}

/**
 * Create a corpse at the given position with a copy of the player's inventory.
 * @param {string} playerId - Owner of the corpse (only they can loot)
 * @param {Position3D} pos - Death position
 * @param {Inventory} inventory - Player inventory to copy
 * @param {number} expiresAt - Timestamp when corpse despawns
 * @returns {Corpse}
 */
export function createCorpse(playerId, pos, inventory, expiresAt) {
  const id = `corpse-${nextCorpseId++}`;
  return {
    id,
    playerId,
    pos: { x: pos.x, y: pos.y ?? 0, z: pos.z },
    inventory: copyInventoryForCorpse(inventory),
    expiresAt,
  };
}

/**
 * Remove expired corpses.
 * @param {Corpse[]} corpses - Mutable array of corpses
 * @param {number} now - Current timestamp
 */
export function stepCorpses(corpses, now) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    if (corpses[i].expiresAt <= now) {
      corpses.splice(i, 1);
    }
  }
}

/**
 * Try to loot the closest corpse belonging to the player within radius.
 * Transfers as many items as possible to player inventory; removes corpse when empty.
 * @param {Corpse[]} corpses - Mutable array of corpses
 * @param {ServerPlayer} player - Player (must have id, pos, inventory, invStackMax)
 * @param {{ lootRadius?: number }} config
 * @returns {{ looted: boolean, corpseId?: string }}
 */
export function tryLootCorpse(corpses, player, config = {}) {
  const lootRadius = config.lootRadius ?? 2.5;
  const lootRadius2 = lootRadius * lootRadius;

  let /** @type {Corpse | null} */ closest = null;
  let closestDist2 = lootRadius2;

  for (const corpse of corpses) {
    if (corpse.playerId !== player.id) continue;
    const dist2 = distance2(player.pos, corpse.pos);
    if (dist2 <= closestDist2) {
      closest = corpse;
      closestDist2 = dist2;
    }
  }

  if (!closest) return { looted: false };

  const stackMax = player.invStackMax ?? 20;
  let transferred = false;

  for (let i = 0; i < closest.inventory.length; i++) {
    const item = closest.inventory[i];
    if (!item || !item.kind) continue;

    if (addItem(player.inventory, item, stackMax)) {
      closest.inventory[i] = null;
      transferred = true;
    }
  }

  if (transferred) {
    player.inv = countInventory(player.inventory);
  }

  const isEmpty = closest.inventory.every((s) => !s);
  if (isEmpty) {
    const idx = corpses.indexOf(closest);
    if (idx >= 0) corpses.splice(idx, 1);
  }

  return { looted: transferred, corpseId: closest.id };
}
