// @ts-check

import { EQUIP_SLOTS } from './equipment.js';

export const PROTOCOL_VERSION = 1;

const MAX_ID_LENGTH = 64;

/**
 * @typedef {{ w?: boolean, a?: boolean, s?: boolean, d?: boolean }} InputKeys
 * @typedef {{ type: 'hello', seq?: number }} HelloMessage
 * @typedef {{ type: 'respawn', seq?: number }} RespawnMessage
 * @typedef {{ type: 'input', keys: Required<InputKeys>, seq?: number }} InputMessage
 * @typedef {{ type: 'moveTarget', x: number, y?: number, z: number, seq?: number }} MoveTargetMessage
 * @typedef {{ type: 'targetSelect', targetId?: string | null, targetKind?: 'mob' | 'player' | null, seq?: number }} TargetSelectMessage
 * @typedef {{ type: 'action', kind: 'interact', seq?: number }} InteractMessage
 * @typedef {{ type: 'action', kind: 'ability', slot: number, seq?: number }} AbilityMessage
 * @typedef {{ type: 'classSelect', classId: string, seq?: number }} ClassSelectMessage
 * @typedef {{ type: 'inventorySwap', from: number, to: number, seq?: number }} InventorySwapMessage
 * @typedef {{ type: 'equipSwap', fromType: 'inventory' | 'equipment', fromSlot: number | string, toType: 'inventory' | 'equipment', toSlot: number | string, seq?: number }} EquipSwapMessage
 * @typedef {{ type: 'vendorSell', vendorId: string, slot: number, seq?: number }} VendorSellMessage
 * @typedef {{ type: 'vendorBuy', vendorId: string, kind: string, count?: number, seq?: number }} VendorBuyMessage
 * @typedef {{ type: 'chat', channel: 'global' | 'area' | 'trade' | 'party', text: string, seq?: number }} ChatMessage
 * @typedef {{ type: 'partyInvite', targetId: string, seq?: number }} PartyInviteMessage
 * @typedef {{ type: 'partyAccept', inviterId: string, seq?: number }} PartyAcceptMessage
 * @typedef {{ type: 'partyLeave', seq?: number }} PartyLeaveMessage
 * @typedef {{ type: 'craft', recipeId: string, count?: number, seq?: number }} CraftMessage
 * @typedef {{ type: 'duelRequest', targetId: string, seq?: number }} DuelRequestMessage
 * @typedef {{ type: 'duelAccept', challengerId: string, seq?: number }} DuelAcceptMessage
 * @typedef {{ type: 'duelDecline', challengerId: string, seq?: number }} DuelDeclineMessage
 * @typedef {{ type: 'duelForfeit', seq?: number }} DuelForfeitMessage
 * @typedef {{ type: 'tradeRequest', targetId: string, seq?: number }} TradeRequestMessage
 * @typedef {{ type: 'tradeAccept', traderId: string, seq?: number }} TradeAcceptMessage
 * @typedef {{ type: 'tradeDecline', traderId: string, seq?: number }} TradeDeclineMessage
 * @typedef {{ type: 'tradeOffer', op: 'add'|'remove', slot?: number, copper?: number, seq?: number }} TradeOfferMessage
 * @typedef {{ type: 'tradeConfirm', seq?: number }} TradeConfirmMessage
 * @typedef {{ type: 'tradeCancel', seq?: number }} TradeCancelMessage
 * @typedef {HelloMessage | RespawnMessage | InputMessage | MoveTargetMessage | TargetSelectMessage | InteractMessage | AbilityMessage | ClassSelectMessage | InventorySwapMessage | EquipSwapMessage | VendorSellMessage | VendorBuyMessage | ChatMessage | PartyInviteMessage | PartyAcceptMessage | PartyLeaveMessage | CraftMessage | DuelRequestMessage | DuelAcceptMessage | DuelDeclineMessage | DuelForfeitMessage | TradeRequestMessage | TradeAcceptMessage | TradeDeclineMessage | TradeOfferMessage | TradeConfirmMessage | TradeCancelMessage} ClientMessage
 */

const CHAT_CHANNELS = new Set(['global', 'area', 'trade', 'party']);
const MAX_CHAT_TEXT_LENGTH = 200;

const CLIENT_MESSAGE_TYPES = new Set([
  'hello',
  'ping',
  'respawn',
  'input',
  'moveTarget',
  'targetSelect',
  'action',
  'classSelect',
  'inventorySwap',
  'equipSwap',
  'vendorSell',
  'vendorBuy',
  'chat',
  'partyInvite',
  'partyAccept',
  'partyLeave',
  'craft',
  'duelRequest',
  'duelAccept',
  'duelDecline',
  'duelForfeit',
  'tradeRequest',
  'tradeAccept',
  'tradeDecline',
  'tradeOffer',
  'tradeConfirm',
  'tradeCancel',
]);

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSeq(value) {
  if (value === undefined) return undefined;
  return Number.isInteger(value) ? value : null;
}

function normalizeString(value, maxLen = MAX_ID_LENGTH) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeTargetKind(value) {
  if (value === 'mob' || value === 'player') return value;
  return null;
}

const EQUIP_SLOT_SET = new Set(EQUIP_SLOTS);

function normalizeSwapType(value) {
  if (value === 'inventory' || value === 'equipment') return value;
  return null;
}

function normalizeSwapSlot(value, type) {
  if (type === 'inventory') {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0) return null;
    return index;
  }
  if (type === 'equipment') {
    const slot = normalizeString(value, 32);
    if (!slot || !EQUIP_SLOT_SET.has(slot)) return null;
    return slot;
  }
  return null;
}

/** @param {InputKeys | null | undefined} raw */
export function sanitizeInputKeys(raw) {
  return {
    w: !!raw?.w,
    a: !!raw?.a,
    s: !!raw?.s,
    d: !!raw?.d,
  };
}

/**
 * Parse and sanitize client -> server messages.
 * Returns null when message is invalid or unsupported.
 * @param {unknown} raw
 * @returns {ClientMessage | null}
 */
export function parseClientMessage(raw) {
  if (!isPlainObject(raw)) return null;
  if (!CLIENT_MESSAGE_TYPES.has(raw.type)) return null;

  const seq = normalizeSeq(raw.seq);
  if (seq === null) return null;

  if (raw.type === 'hello') {
    return { type: 'hello', seq };
  }

  if (raw.type === 'respawn') {
    return { type: 'respawn', seq };
  }

  if (raw.type === 'ping') {
    const t = typeof raw.t === 'number' && Number.isFinite(raw.t) ? raw.t : Date.now();
    return { type: 'ping', seq, t };
  }

  if (raw.type === 'input') {
    return {
      type: 'input',
      keys: sanitizeInputKeys(raw.keys),
      seq,
    };
  }

  if (raw.type === 'moveTarget') {
    const x = Number(raw.x);
    const z = Number(raw.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const y = raw.y !== undefined ? Number(raw.y) : 0;
    return { type: 'moveTarget', x, y: Number.isFinite(y) ? y : 0, z, seq };
  }

  if (raw.type === 'targetSelect') {
    if (raw.targetId === null || raw.targetId === undefined) {
      return { type: 'targetSelect', targetId: null, targetKind: null, seq };
    }
    const targetId = normalizeString(raw.targetId);
    if (!targetId) return null;
    const targetKind = normalizeTargetKind(raw.targetKind);
    return { type: 'targetSelect', targetId, targetKind, seq };
  }

  if (raw.type === 'action') {
    if (raw.kind === 'interact') {
      return { type: 'action', kind: 'interact', seq };
    }
    if (raw.kind === 'ability') {
      const slot = Number(raw.slot);
      if (!Number.isInteger(slot) || slot < 1) return null;
      const placementX = raw.placementX !== undefined ? Number(raw.placementX) : undefined;
      const placementZ = raw.placementZ !== undefined ? Number(raw.placementZ) : undefined;
      return {
        type: 'action',
        kind: 'ability',
        slot,
        seq,
        ...(Number.isFinite(placementX) && Number.isFinite(placementZ)
          ? { placementX, placementZ }
          : {}),
      };
    }
    return null;
  }

  if (raw.type === 'classSelect') {
    const classId = normalizeString(raw.classId);
    if (!classId) return null;
    return { type: 'classSelect', classId, seq };
  }

  if (raw.type === 'inventorySwap') {
    const from = Number(raw.from);
    const to = Number(raw.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
    return { type: 'inventorySwap', from, to, seq };
  }

  if (raw.type === 'equipSwap') {
    const fromType = normalizeSwapType(raw.fromType);
    const toType = normalizeSwapType(raw.toType);
    if (!fromType || !toType) return null;
    const fromSlot = normalizeSwapSlot(raw.fromSlot, fromType);
    const toSlot = normalizeSwapSlot(raw.toSlot, toType);
    if (fromSlot === null || toSlot === null) return null;
    return { type: 'equipSwap', fromType, fromSlot, toType, toSlot, seq };
  }

  if (raw.type === 'vendorSell') {
    const vendorId = normalizeString(raw.vendorId);
    const slot = Number(raw.slot);
    if (!vendorId || !Number.isInteger(slot)) return null;
    return { type: 'vendorSell', vendorId, slot, seq };
  }

  if (raw.type === 'vendorBuy') {
    const vendorId = normalizeString(raw.vendorId);
    const kind = normalizeString(raw.kind, 64);
    if (!vendorId || !kind) return null;
    const count = raw.count !== undefined ? Number(raw.count) : 1;
    const safeCount = Number.isInteger(count) && count >= 1 ? Math.min(count, 99) : 1;
    return { type: 'vendorBuy', vendorId, kind, count: safeCount, seq };
  }

  if (raw.type === 'chat') {
    const channel = raw.channel;
    if (!CHAT_CHANNELS.has(channel)) return null;
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text || text.length > MAX_CHAT_TEXT_LENGTH) return null;
    return { type: 'chat', channel, text, seq };
  }

  if (raw.type === 'partyInvite') {
    const targetId = normalizeString(raw.targetId);
    if (!targetId) return null;
    return { type: 'partyInvite', targetId, seq };
  }

  if (raw.type === 'partyAccept') {
    const inviterId = normalizeString(raw.inviterId);
    if (!inviterId) return null;
    return { type: 'partyAccept', inviterId, seq };
  }

  if (raw.type === 'partyLeave') {
    return { type: 'partyLeave', seq };
  }

  if (raw.type === 'craft') {
    const recipeId = normalizeString(raw.recipeId, 64);
    if (!recipeId) return null;
    const count = raw.count !== undefined ? Number(raw.count) : 1;
    const safeCount = Number.isInteger(count) && count >= 1 ? Math.min(count, 99) : 1;
    return { type: 'craft', recipeId, count: safeCount, seq };
  }

  if (raw.type === 'duelRequest') {
    const targetId = normalizeString(raw.targetId);
    if (!targetId) return null;
    return { type: 'duelRequest', targetId, seq };
  }

  if (raw.type === 'duelAccept') {
    const challengerId = normalizeString(raw.challengerId);
    if (!challengerId) return null;
    return { type: 'duelAccept', challengerId, seq };
  }

  if (raw.type === 'duelDecline') {
    const challengerId = normalizeString(raw.challengerId);
    if (!challengerId) return null;
    return { type: 'duelDecline', challengerId, seq };
  }

  if (raw.type === 'duelForfeit') {
    return { type: 'duelForfeit', seq };
  }

  if (raw.type === 'tradeRequest') {
    const targetId = normalizeString(raw.targetId);
    if (!targetId) return null;
    return { type: 'tradeRequest', targetId, seq };
  }

  if (raw.type === 'tradeAccept') {
    const traderId = normalizeString(raw.traderId);
    if (!traderId) return null;
    return { type: 'tradeAccept', traderId, seq };
  }

  if (raw.type === 'tradeDecline') {
    const traderId = normalizeString(raw.traderId);
    if (!traderId) return null;
    return { type: 'tradeDecline', traderId, seq };
  }

  if (raw.type === 'tradeOffer') {
    const op = raw.op === 'add' || raw.op === 'remove' ? raw.op : null;
    if (!op) return null;
    if (op === 'add') {
      const slot = raw.slot !== undefined ? Number(raw.slot) : null;
      const copper = raw.copper !== undefined ? Number(raw.copper) : null;
      if (Number.isInteger(slot) && slot >= 0) return { type: 'tradeOffer', op, slot, seq };
      if (Number.isInteger(copper) && copper >= 0) return { type: 'tradeOffer', op, copper, seq };
      return null;
    }
    const slot = raw.slot !== undefined ? Number(raw.slot) : null;
    const copper = raw.copper !== undefined;
    if (Number.isInteger(slot) && slot >= 0) return { type: 'tradeOffer', op, slot, seq };
    if (copper) return { type: 'tradeOffer', op, copper: 1, seq };
    return null;
  }

  if (raw.type === 'tradeConfirm') {
    return { type: 'tradeConfirm', seq };
  }

  if (raw.type === 'tradeCancel') {
    return { type: 'tradeCancel', seq };
  }

  return null;
}

export { CHAT_CHANNELS, MAX_CHAT_TEXT_LENGTH };

export const CLIENT_MESSAGE_TYPES_LIST = Array.from(CLIENT_MESSAGE_TYPES);
