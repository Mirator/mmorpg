// @ts-check

export const PROTOCOL_VERSION = 1;

const MAX_ID_LENGTH = 64;

/**
 * @typedef {{ w?: boolean, a?: boolean, s?: boolean, d?: boolean }} InputKeys
 * @typedef {{ type: 'hello', seq?: number }} HelloMessage
 * @typedef {{ type: 'input', keys: Required<InputKeys>, seq?: number }} InputMessage
 * @typedef {{ type: 'moveTarget', x: number, z: number, seq?: number }} MoveTargetMessage
 * @typedef {{ type: 'action', kind: 'interact', seq?: number }} InteractMessage
 * @typedef {{ type: 'action', kind: 'ability', slot: number, seq?: number }} AbilityMessage
 * @typedef {{ type: 'classSelect', classId: string, seq?: number }} ClassSelectMessage
 * @typedef {{ type: 'inventorySwap', from: number, to: number, seq?: number }} InventorySwapMessage
 * @typedef {{ type: 'vendorSell', vendorId: string, slot: number, seq?: number }} VendorSellMessage
 * @typedef {HelloMessage | InputMessage | MoveTargetMessage | InteractMessage | AbilityMessage | ClassSelectMessage | InventorySwapMessage | VendorSellMessage} ClientMessage
 */

const CLIENT_MESSAGE_TYPES = new Set([
  'hello',
  'input',
  'moveTarget',
  'action',
  'classSelect',
  'inventorySwap',
  'vendorSell',
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
    return { type: 'moveTarget', x, z, seq };
  }

  if (raw.type === 'action') {
    if (raw.kind === 'interact') {
      return { type: 'action', kind: 'interact', seq };
    }
    if (raw.kind === 'ability') {
      const slot = Number(raw.slot);
      if (!Number.isInteger(slot) || slot < 1) return null;
      return { type: 'action', kind: 'ability', slot, seq };
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

  if (raw.type === 'vendorSell') {
    const vendorId = normalizeString(raw.vendorId);
    const slot = Number(raw.slot);
    if (!vendorId || !Number.isInteger(slot)) return null;
    return { type: 'vendorSell', vendorId, slot, seq };
  }

  return null;
}

export const CLIENT_MESSAGE_TYPES_LIST = Array.from(CLIENT_MESSAGE_TYPES);
