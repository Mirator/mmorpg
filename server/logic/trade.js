// @ts-check

import { playersInRange } from './duel.js';
import { addItem, countInventory } from './inventory.js';

/** @type {Map<string, import('./trade.js').TradeSession>} */
const tradeSessions = new Map();

/**
 * @typedef {{ id: string, a: Object, b: Object, offerA: { items: Array<Object|null>, copper: number }, offerB: { items: Array<Object|null>, copper: number }, confirmedA: boolean, confirmedB: boolean }} TradeSession
 */

/**
 * @param {Object} player
 * @returns {boolean}
 */
export function isTrading(player) {
  return tradeSessions.has(player?.id);
}

/**
 * @param {Object} a - Requester
 * @param {Object} b - Accepter
 * @param {Map<string, Object>} players
 * @returns {TradeSession | null}
 */
export function createTradeSession(a, b, players) {
  if (!a || !b || a.id === b.id) return null;
  if (tradeSessions.has(a.id) || tradeSessions.has(b.id)) return null;
  if (!playersInRange(a, b)) return null;
  if (a.dead || b.dead) return null;
  const id = `${a.id}-${b.id}`;
  const session = {
    id,
    a,
    b,
    offerA: { items: [], copper: 0 },
    offerB: { items: [], copper: 0 },
    confirmedA: false,
    confirmedB: false,
  };
  tradeSessions.set(a.id, session);
  tradeSessions.set(b.id, session);
  return session;
}

/**
 * @param {string} playerId
 * @returns {TradeSession | null}
 */
export function getTradeSession(playerId) {
  return tradeSessions.get(playerId) ?? null;
}

/**
 * @param {Object} player
 * @returns {Object | null} - The other player in the trade
 */
export function getTradePartner(player) {
  const session = tradeSessions.get(player?.id);
  if (!session) return null;
  return session.a.id === player.id ? session.b : session.a;
}

/**
 * @param {Object} player
 * @returns {{ items: Array<Object|null>, copper: number }}
 */
export function getMyOffer(player) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { items: [], copper: 0 };
  return session.a.id === player.id ? session.offerA : session.offerB;
}

/**
 * @param {Object} player
 * @returns {{ items: Array<Object|null>, copper: number }}
 */
export function getOtherOffer(player) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { items: [], copper: 0 };
  return session.a.id === player.id ? session.offerB : session.offerA;
}

/**
 * Add item from inventory slot to player's offer.
 * @param {Object} player
 * @param {number} invSlot
 * @returns {{ ok: boolean, error?: string }}
 */
export function addItemToOffer(player, invSlot) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { ok: false, error: 'not_trading' };
  const offer = session.a.id === player.id ? session.offerA : session.offerB;
  if (session.confirmedA || session.confirmedB) return { ok: false, error: 'locked' };
  const inv = player?.inventory;
  if (!Array.isArray(inv) || invSlot < 0 || invSlot >= inv.length) return { ok: false, error: 'invalid_slot' };
  const item = inv[invSlot];
  if (!item) return { ok: false, error: 'empty_slot' };
  const copy = { ...item, count: item.count ?? 1 };
  inv[invSlot] = null;
  offer.items.push(copy);
  return { ok: true };
}

/**
 * Add copper to player's offer.
 * @param {Object} player
 * @param {number} amount
 * @returns {{ ok: boolean, error?: string }}
 */
export function addCopperToOffer(player, amount) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { ok: false, error: 'not_trading' };
  const offer = session.a.id === player.id ? session.offerA : session.offerB;
  if (session.confirmedA || session.confirmedB) return { ok: false, error: 'locked' };
  const have = Number(player?.currencyCopper ?? 0);
  const alreadyOffered = offer.copper;
  const add = Math.max(0, Math.min(amount, have - alreadyOffered));
  if (add <= 0) return { ok: false, error: 'insufficient' };
  offer.copper += add;
  return { ok: true };
}

/**
 * Remove item at offer index, return to first free inventory slot.
 * @param {Object} player
 * @param {number} offerIndex
 * @returns {{ ok: boolean, error?: string }}
 */
export function removeItemFromOffer(player, offerIndex) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { ok: false, error: 'not_trading' };
  const offer = session.a.id === player.id ? session.offerA : session.offerB;
  if (session.confirmedA || session.confirmedB) return { ok: false, error: 'locked' };
  if (offerIndex < 0 || offerIndex >= offer.items.length) return { ok: false, error: 'invalid_slot' };
  const item = offer.items.splice(offerIndex, 1)[0];
  if (!item) return { ok: true };
  const inv = player?.inventory;
  if (!Array.isArray(inv)) return { ok: true };
  const stackMax = Number(player?.invStackMax ?? 20) || 20;
  if (!addItem(inv, item, stackMax)) {
    offer.items.splice(offerIndex, 0, item);
    return { ok: false, error: 'inventory_full' };
  }
  return { ok: true };
}

/**
 * Remove copper from offer.
 * @param {Object} player
 * @returns {{ ok: boolean }}
 */
export function removeCopperFromOffer(player) {
  const session = tradeSessions.get(player?.id);
  if (!session) return { ok: false };
  const offer = session.a.id === player.id ? session.offerA : session.offerB;
  if (session.confirmedA || session.confirmedB) return { ok: false };
  offer.copper = 0;
  return { ok: true };
}

/**
 * Check if inventory can fit all offered items (conservative: same kind stacks).
 * @param {Object} inv
 * @param {Array<Object|null>} items
 * @param {number} stackMax
 * @returns {boolean}
 */
function canAcceptItems(inv, items, stackMax) {
  if (!Array.isArray(inv)) return false;
  const toAdd = items.filter((i) => i && (i.count ?? 0) > 0);
  if (toAdd.length === 0) return true;
  const stackMaxSafe = Math.max(1, stackMax);
  const byKind = {};
  for (const item of toAdd) {
    const k = item.kind ?? 'unknown';
    byKind[k] = (byKind[k] ?? 0) + (item.count ?? 1);
  }
  let neededSlots = 0;
  const invByKind = {};
  for (const s of inv) {
    if (!s) continue;
    const k = s.kind ?? 'unknown';
    invByKind[k] = (invByKind[k] ?? 0) + (s.count ?? 1);
  }
  for (const [kind, count] of Object.entries(byKind)) {
    const existing = invByKind[kind] ?? 0;
    const total = existing + count;
    const stacks = Math.ceil(total / stackMaxSafe);
    const existingStacks = Math.ceil(existing / stackMaxSafe);
    neededSlots += Math.max(0, stacks - existingStacks);
  }
  const freeSlots = inv.filter((s) => !s).length;
  return neededSlots <= freeSlots;
}

/**
 * Execute the trade: swap offers, deduct copper.
 * @param {TradeSession} session
 * @param {Function} markDirty
 * @returns {{ ok: boolean, error?: string }}
 */
export function executeTrade(session, markDirty) {
  if (!session.confirmedA || !session.confirmedB) return { ok: false, error: 'not_confirmed' };
  const { a, b, offerA, offerB } = session;
  const stackMaxA = Number(a?.invStackMax ?? 20) || 20;
  const stackMaxB = Number(b?.invStackMax ?? 20) || 20;
  if (!canAcceptItems(a.inventory, offerB.items, stackMaxB)) return { ok: false, error: 'a_inventory_full' };
  if (!canAcceptItems(b.inventory, offerA.items, stackMaxA)) return { ok: false, error: 'b_inventory_full' };
  const copperA = Number(a?.currencyCopper ?? 0);
  const copperB = Number(b?.currencyCopper ?? 0);
  if (offerA.copper > copperA || offerB.copper > copperB) return { ok: false, error: 'insufficient_copper' };

  for (const item of offerB.items) {
    if (item) addItem(a.inventory, item, stackMaxB);
  }
  for (const item of offerA.items) {
    if (item) addItem(b.inventory, item, stackMaxA);
  }
  a.currencyCopper = copperA - offerA.copper + offerB.copper;
  b.currencyCopper = copperB - offerB.copper + offerA.copper;
  a.inv = countInventory(a.inventory);
  b.inv = countInventory(b.inventory);
  markDirty(a);
  markDirty(b);
  return { ok: true };
}

/**
 * End trade session and return both players' offered items to their inventories.
 * @param {Object} player - Either participant (used to find the session)
 */
export function endTradeSession(player, returnItems = true) {
  const session = tradeSessions.get(player?.id);
  if (!session) return;
  tradeSessions.delete(session.a.id);
  tradeSessions.delete(session.b.id);
  if (!returnItems) return;
  const stackMaxA = Number(session.a?.invStackMax ?? 20) || 20;
  const stackMaxB = Number(session.b?.invStackMax ?? 20) || 20;
  if (Array.isArray(session.a?.inventory)) {
    for (const item of session.offerA.items) {
      if (item) addItem(session.a.inventory, item, stackMaxA);
    }
    session.a.inv = countInventory(session.a.inventory);
  }
  if (Array.isArray(session.b?.inventory)) {
    for (const item of session.offerB.items) {
      if (item) addItem(session.b.inventory, item, stackMaxB);
    }
    session.b.inv = countInventory(session.b.inventory);
  }
}
