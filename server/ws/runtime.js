// @ts-check
import crypto from 'node:crypto';
import { getResourceForClass } from '../../shared/classes.js';
import { computeDerivedStats } from '../../shared/attributes.js';
import { normalizeId } from '../authParsing.js';

/**
 * @param {any} ws
 * @param {unknown} msg
 */
export function safeSend(ws, msg) {
  if (!ws) return;
  const open = typeof ws.OPEN === 'number' ? ws.OPEN : 1;
  if (ws.readyState !== open) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Ignore send errors for closing sockets.
  }
}

/**
 * @param {any} ws
 * @param {string} data
 */
export function safeSendRaw(ws, data) {
  if (!ws) return;
  const open = typeof ws.OPEN === 'number' ? ws.OPEN : 1;
  if (ws.readyState !== open) return;
  try {
    ws.send(data);
  } catch {
    // Ignore send errors for closing sockets.
  }
}

/**
 * @param {string | null | undefined} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * @param {any} req
 * @param {boolean} trustProxy
 * @returns {string}
 */
export function getRemoteAddress(req, trustProxy) {
  if (trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return normalizeIp(xf.split(',')[0]?.trim());
    }
    if (Array.isArray(xf) && xf[0]) {
      return normalizeIp(xf[0].split(',')[0]?.trim());
    }
  }
  return normalizeIp(req.socket.remoteAddress ?? 'unknown');
}

/**
 * @param {number} max
 * @param {number} intervalMs
 * @returns {() => boolean}
 */
export function createMessageLimiter(max, intervalMs) {
  let windowStart = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= intervalMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= max;
  };
}

export function generatePlayerId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * @param {any} player
 */
export function initCombatState(player) {
  if (!player) return;
  const resourceDef = getResourceForClass(player.classId);
  const resourceType = resourceDef?.type ?? null;
  const isManaClass = resourceType === 'mana';
  const resourceMax = isManaClass
    ? computeDerivedStats(player).maxMana
    : (resourceDef?.max ?? 0);
  player.resourceType = resourceType;
  player.resourceMax = resourceMax;
  player.resource = resourceType === 'rage' ? 0 : resourceMax;
  player.abilityCooldowns = {};
  player.globalCooldownUntil = 0;
  player.combatTagUntil = 0;
  player.lastMoveDir = null;
  player.movedThisTick = false;
  player.cast = null;
  player.harvest = null;
  player.moveSpeedMultiplier = 1;
  player.damageTakenMultiplier = 1;
  player.slowImmuneUntil = 0;
  player.defensiveStanceUntil = 0;
  player.targetKind = null;
}

/**
 * @param {any} params
 * @returns {any}
 */
export function createRuntimePlayer({
  id,
  ws,
  state,
  accountId,
  name,
  nameLower,
}) {
  return {
    id,
    ws,
    pos: state.pos,
    target: null,
    keys: { w: false, a: false, s: false, d: false, walk: false },
    lastInputSeq: 0,
    hp: state.hp,
    maxHp: state.maxHp,
    inv: state.inv,
    invCap: state.invCap,
    invSlots: state.invSlots,
    invStackMax: state.invStackMax,
    inventory: state.inventory,
    currencyCopper: state.currencyCopper,
    equipment: state.equipment,
    dead: false,
    respawnAt: 0,
    targetId: null,
    classId: state.classId,
    level: state.level,
    xp: state.xp,
    attackCooldownUntil: 0,
    harvest: null,
    accountId: accountId ?? null,
    name: name ?? null,
    nameLower: nameLower ?? null,
    partyId: null,
  };
}

/**
 * @param {any} req
 * @returns {{ characterId: string | null, guest: boolean, ticket: string | null }}
 */
export function parseConnectionParams(req) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const characterId = normalizeId(url.searchParams.get('characterId'));
    const guest = url.searchParams.get('guest') === '1';
    const ticket = url.searchParams.get('ticket')?.trim() || null;
    return { characterId, guest, ticket };
  } catch {
    return { characterId: null, guest: false, ticket: null };
  }
}
