// @ts-check
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '../shared/protocol.js';
import {
  DEFAULT_CLASS_ID,
  getResourceForClass,
} from '../shared/classes.js';
import { computeDerivedStats } from '../shared/attributes.js';
import {
  serializePlayerPrivate,
  serializeResources,
  serializeMobs,
  serializeCorpses,
} from './admin.js';
import { worldSnapshot } from './logic/world.js';
import { countInventory } from './logic/inventory.js';
import { loadPlayer, savePlayer } from './db/playerRepo.js';
import { hydratePlayerState, migratePlayerState, serializePlayerState } from './db/playerState.js';
import { createBasePlayerState } from './logic/players.js';
import { getSessionWithAccount, touchSession } from './db/sessionRepo.js';
import { updateAccountLastSeen } from './db/accountRepo.js';
import { sendCombatLog } from './logic/combatLog.js';
import { leaveParty, getPartyForPlayer } from './logic/party.js';
import { endDuel } from './logic/duel.js';
import { endTradeSession, getTradePartner } from './logic/trade.js';
import { validateAndConsumeTicket } from './wsTicket.js';
import { createMessageHandlers } from './ws/handlers/index.js';
import { getCookieValue, normalizeId } from './authParsing.js';

// Ownership boundary: this module owns WS connection lifecycle, auth gating, and AOI broadcasts.
// Gameplay message behavior should stay in server/ws/handlers/* to keep this file transport-focused.

/** @typedef {import('./types/domain.d.ts').CombatEvent} CombatEvent */
/** @typedef {import('./types/domain.d.ts').Corpse} Corpse */
/** @typedef {import('./types/domain.d.ts').AuthAccount} AuthAccount */
/** @typedef {import('./types/domain.d.ts').DeltaStateMessage} DeltaStateMessage */
/** @typedef {import('./types/domain.d.ts').MobEntity} MobEntity */
/** @typedef {import('./types/domain.d.ts').PlayerMap} PlayerMap */
/** @typedef {import('./types/domain.d.ts').Position3D} Position3D */
/** @typedef {import('./types/domain.d.ts').PublicPlayersById} PublicPlayersById */
/** @typedef {import('./types/domain.d.ts').PublicStateMessage} PublicStateMessage */
/** @typedef {import('./types/domain.d.ts').ResourceNode} ResourceNode */
/** @typedef {import('./types/domain.d.ts').RuntimePlayerState} RuntimePlayerState */
/** @typedef {import('./types/domain.d.ts').SocketLike} SocketLike */
/** @typedef {import('./types/domain.d.ts').ServerPlayer} ServerPlayer */
/** @typedef {import('./types/domain.d.ts').SpawnerLike} SpawnerLike */
/** @typedef {import('./types/domain.d.ts').StoredCharacter} StoredCharacter */
/** @typedef {import('./types/domain.d.ts').WsClient} WsClient */
/** @typedef {import('./types/domain.d.ts').WsMessageHandlerContext} WsMessageHandlerContext */
/** @typedef {import('./types/domain.d.ts').WsPersistenceLike} WsPersistenceLike */
/** @typedef {import('./types/domain.d.ts').WsServerConfig} WsServerConfig */
/** @typedef {import('./types/domain.d.ts').WsTicketData} WsTicketData */
/** @typedef {import('./types/domain.d.ts').WsUpgradeRequest} WsUpgradeRequest */
/** @typedef {{ id: string, ws: WsClient, state: RuntimePlayerState, accountId?: string | null, name?: string | null, nameLower?: string | null }} RuntimePlayerParams */
/** @typedef {{ characterId: string | null, guest: boolean, ticket: string | null }} ConnectionParams */
/** @typedef {{ server: import('http').Server, config: WsServerConfig, world: unknown, resources: ResourceNode[], mobs: MobEntity[], corpses: Corpse[], players: PlayerMap, spawner: SpawnerLike, persistence: WsPersistenceLike, nextItemIdRef?: { current: number } }} CreateWebSocketServerArgs */

/**
 * @param {SocketLike | null | undefined} ws
 * @param {unknown} msg
 */
function safeSend(ws, msg) {
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
 * @param {SocketLike | null | undefined} ws
 * @param {string} data
 */
function safeSendRaw(ws, data) {
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
 * @param {WsUpgradeRequest} req
 * @param {boolean} trustProxy
 * @returns {string}
 */
function getRemoteAddress(req, trustProxy) {
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
function createMessageLimiter(max, intervalMs) {
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

function generatePlayerId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * @param {ServerPlayer | null | undefined} player
 */
function initCombatState(player) {
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
  player.moveSpeedMultiplier = 1;
  player.damageTakenMultiplier = 1;
  player.slowImmuneUntil = 0;
  player.defensiveStanceUntil = 0;
  player.targetKind = null;
}

/**
 * @param {RuntimePlayerParams} params
 * @returns {ServerPlayer}
 */
function createRuntimePlayer({
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
    keys: { w: false, a: false, s: false, d: false },
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
    accountId: accountId ?? null,
    name: name ?? null,
    nameLower: nameLower ?? null,
    partyId: null,
  };
}

/**
 * @param {WsUpgradeRequest} req
 * @returns {ConnectionParams}
 */
function parseConnectionParams(req) {
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

/**
 * @param {CreateWebSocketServerArgs} deps
 */
export function createWebSocketServer({
  server,
  config,
  world,
  resources,
  mobs,
  corpses,
  players,
  spawner,
  persistence,
  nextItemIdRef = { current: 1 },
}) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadBytes,
    perMessageDeflate: false,
  });

  const connectionsByIp = new Map();

  /**
   * @param {string | string[] | undefined | null} origin
   * @returns {boolean}
   */
  function isAllowedOrigin(origin) {
    const originValue = Array.isArray(origin) ? origin[0] : origin;
    if (!originValue) {
      if (!config.allowNoOrigin) return false;
      return config.allowNoOriginRemote || config.isLocalhost;
    }
    return config.allowedOrigins.has(originValue);
  }

  /**
   * @param {string} ip
   * @returns {boolean}
   */
  function canAcceptConnection(ip) {
    return (connectionsByIp.get(ip) ?? 0) < config.maxConnectionsPerIp;
  }

  /**
   * @param {string} ip
   */
  function trackConnection(ip) {
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
  }

  /**
   * @param {string} ip
   */
  function untrackConnection(ip) {
    const next = (connectionsByIp.get(ip) ?? 1) - 1;
    if (next <= 0) {
      connectionsByIp.delete(ip);
    } else {
      connectionsByIp.set(ip, next);
    }
  }

  const aoiRadius = config.aoiRadius ?? 80;
  const aoiRadius2 = aoiRadius * aoiRadius;

  /**
   * @param {Position3D | null | undefined} pos
   * @param {Position3D | null | undefined} centerPos
   * @param {number} [radius2]
   * @returns {boolean}
   */
  function isInAOI(pos, centerPos, radius2 = aoiRadius2) {
    if (!pos || !centerPos) return false;
    const dx = (pos.x ?? 0) - (centerPos.x ?? 0);
    const dz = (pos.z ?? 0) - (centerPos.z ?? 0);
    return dx * dx + dz * dz <= radius2;
  }

  /**
   * @param {unknown} dir
   * @returns {{ x: number, z: number } | null}
   */
  function normalizeFacingDir(dir) {
    if (!dir || typeof dir !== 'object') return null;
    const x = Number(/** @type {any} */ (dir).x);
    const z = Number(/** @type {any} */ (dir).z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const dist = Math.hypot(x, z);
    if (dist <= 0.0001) return null;
    return { x: x / dist, z: z / dist };
  }

  /**
   * @param {string | null | undefined} playerId
   * @returns {string[]}
   */
  function getPartyMemberIds(playerId) {
    if (!playerId) return [];
    const party = getPartyForPlayer(playerId, players);
    return party ? party.memberIds : [];
  }

  /**
   * @param {PlayerMap} playersMap
   * @param {Position3D} centerPos
   * @param {string[]} [includeIds]
   * @returns {PublicPlayersById}
   */
  function filterPlayersByAOI(playersMap, centerPos, includeIds = []) {
    /** @type {PublicPlayersById} */
    const out = {};
    const includeSet = new Set(includeIds ?? []);
    for (const [id, p] of playersMap.entries()) {
      if (!p?.pos) continue;
      if (includeSet.has(id) || isInAOI(p.pos, centerPos)) {
        /** @type {import('./types/domain.d.ts').PublicPlayerState} */
        const playerState = {
          x: p.pos.x,
          y: p.pos.y ?? 0,
          z: p.pos.z,
          hp: p.hp ?? 0,
          maxHp: p.maxHp ?? 0,
          inv: p.inv ?? 0,
          currencyCopper: p.currencyCopper ?? 0,
          dead: Boolean(p.dead),
          classId: p.classId ?? null,
          level: p.level ?? 1,
          name: p.name ?? null,
        };
        const facingDir = normalizeFacingDir(p.lastMoveDir);
        if (facingDir) {
          playerState.dirX = facingDir.x;
          playerState.dirZ = facingDir.z;
        }
        out[id] = playerState;
      }
    }
    return out;
  }

  /**
   * @param {ResourceNode[]} resourcesArr
   * @param {Position3D} centerPos
   * @returns {ResourceNode[]}
   */
  function filterResourcesByAOI(resourcesArr, centerPos) {
    return resourcesArr.filter((r) =>
      isInAOI({ x: r.x, z: r.z }, centerPos)
    );
  }

  /**
   * @param {MobEntity[]} mobsArr
   * @param {Position3D} centerPos
   * @returns {MobEntity[]}
   */
  function filterMobsByAOI(mobsArr, centerPos) {
    return mobsArr.filter((m) =>
      isInAOI(m?.pos ?? { x: m.x, z: m.z }, centerPos)
    );
  }

  /**
   * @param {Corpse[]} corpsesArr
   * @param {Position3D} centerPos
   * @returns {Corpse[]}
   */
  function filterCorpsesByAOI(corpsesArr, centerPos) {
    if (!Array.isArray(corpsesArr)) return [];
    return corpsesArr.filter((c) => {
      const pos = c.pos;
      return isInAOI(pos, centerPos);
    });
  }

  /**
   * @param {ServerPlayer} player
   * @param {number} now
   * @returns {PublicStateMessage}
   */
  function buildPublicStateForPlayer(player, now) {
    const pos = player?.pos ?? { x: 0, y: 0, z: 0 };
    const partyIds = getPartyMemberIds(player?.id);
    const filteredPlayers = filterPlayersByAOI(players, pos, partyIds);
    const filteredResources = filterResourcesByAOI(resources, pos);
    const filteredMobs = filterMobsByAOI(mobs, pos);
    const filteredCorpses = filterCorpsesByAOI(corpses ?? [], pos);
    return {
      type: 'state',
      t: now,
      players: filteredPlayers,
      resources: serializeResources(filteredResources),
      mobs: serializeMobs(filteredMobs),
      corpses: serializeCorpses(filteredCorpses),
    };
  }

  /** @type {Map<string, PublicStateMessage>} */
  const lastSentByPlayer = new Map();
  const DELTA_FULL_THRESHOLD = 0.8;

  /**
   * @param {unknown} a
   * @param {unknown} b
   * @returns {boolean}
   */
  function entityChanged(a, b) {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  /**
   * @template T
   * @param {Array<T & { id: string }> | undefined | null} arr
   * @returns {Map<string, T & { id: string }>}
   */
  function byId(arr) {
    const out = new Map();
    for (const item of arr ?? []) out.set(item.id, item);
    return out;
  }

  /**
   * @param {ServerPlayer} player
   * @param {PublicStateMessage} currentState
   * @param {number} now
   * @returns {PublicStateMessage | DeltaStateMessage}
   */
  function buildDeltaState(player, currentState, now) {
    const last = lastSentByPlayer.get(player.id);
    if (!last) {
      return { ...currentState, full: true };
    }

    /** @type {PublicPlayersById} */
    const deltaPlayers = {};
    /** @type {string[]} */
    const removedPlayers = [];
    for (const [id, curr] of Object.entries(currentState.players)) {
      const prev = last.players?.[id];
      if (!prev || entityChanged(prev, curr)) {
        deltaPlayers[id] = curr;
      }
    }
    for (const id of Object.keys(last.players ?? {})) {
      if (!(id in (currentState.players ?? {}))) {
        removedPlayers.push(id);
      }
    }

    /** @type {import('./types/domain.d.ts').SerializedResource[]} */
    const deltaResources = [];
    /** @type {string[]} */
    const removedResources = [];
    const lastResMap = byId(last.resources);
    const currResIds = new Set();
    for (const curr of currentState.resources ?? []) {
      currResIds.add(curr.id);
      const prev = lastResMap.get(curr.id);
      if (!prev || entityChanged(prev, curr)) {
        deltaResources.push(curr);
      }
    }
    for (const r of last.resources ?? []) {
      if (!currResIds.has(r.id)) removedResources.push(r.id);
    }

    /** @type {import('./types/domain.d.ts').SerializedMob[]} */
    const deltaMobs = [];
    /** @type {string[]} */
    const removedMobs = [];
    const lastMobMap = byId(last.mobs);
    const currMobIds = new Set();
    for (const curr of currentState.mobs ?? []) {
      currMobIds.add(curr.id);
      const prev = lastMobMap.get(curr.id);
      if (!prev || entityChanged(prev, curr)) {
        deltaMobs.push(curr);
      }
    }
    for (const m of last.mobs ?? []) {
      if (!currMobIds.has(m.id)) removedMobs.push(m.id);
    }

    /** @type {import('./types/domain.d.ts').SerializedCorpse[]} */
    const deltaCorpses = [];
    /** @type {string[]} */
    const removedCorpses = [];
    const lastCorpseMap = byId(last.corpses);
    const currCorpseIds = new Set();
    for (const curr of currentState.corpses ?? []) {
      currCorpseIds.add(curr.id);
      const prev = lastCorpseMap.get(curr.id);
      if (!prev || entityChanged(prev, curr)) {
        deltaCorpses.push(curr);
      }
    }
    for (const c of last.corpses ?? []) {
      if (!currCorpseIds.has(c.id)) removedCorpses.push(c.id);
    }

    const totalCurrent =
      (currentState.players ? Object.keys(currentState.players).length : 0) +
      (currentState.resources?.length ?? 0) +
      (currentState.mobs?.length ?? 0) +
      (currentState.corpses?.length ?? 0);
    const totalDelta =
      Object.keys(deltaPlayers).length +
      deltaResources.length +
      deltaMobs.length +
      deltaCorpses.length +
      removedPlayers.length +
      removedResources.length +
      removedMobs.length +
      removedCorpses.length;
    const sendFull =
      totalCurrent === 0 || totalDelta / Math.max(1, totalCurrent) >= DELTA_FULL_THRESHOLD;

    if (sendFull) {
      return { ...currentState, full: true };
    }

    /** @type {DeltaStateMessage} */
    const msg = { type: 'state', t: now };
    if (Object.keys(deltaPlayers).length > 0) msg.players = deltaPlayers;
    if (deltaResources.length > 0) msg.resources = deltaResources;
    if (deltaMobs.length > 0) msg.mobs = deltaMobs;
    if (removedPlayers.length > 0) msg.removedPlayers = removedPlayers;
    if (removedResources.length > 0) msg.removedResources = removedResources;
    if (removedMobs.length > 0) msg.removedMobs = removedMobs;
    if (deltaCorpses.length > 0) msg.corpses = deltaCorpses;
    if (removedCorpses.length > 0) msg.removedCorpses = removedCorpses;
    return msg;
  }

  /**
   * @param {WsClient | null | undefined} ws
   * @param {ServerPlayer} player
   * @param {number} now
   */
  function sendPrivateState(ws, player, now) {
    safeSend(ws, {
      type: 'me',
      t: now,
      data: serializePlayerPrivate(player),
      id: player.id,
    });
  }

  const COMBAT_VFX_RADIUS = 25;
  const COMBAT_VFX_RADIUS2 = COMBAT_VFX_RADIUS * COMBAT_VFX_RADIUS;

  /**
   * @param {Position3D | null | undefined} pos
   * @param {CombatEvent | null | undefined} event
   * @returns {boolean}
   */
  function shouldReceiveCombatEvent(pos, event) {
    if (!pos || !event) return false;
    const from = event.from;
    const to = event.to;
    const center = event.center ?? from;
    const dxFrom = pos.x - (from?.x ?? 0);
    const dzFrom = pos.z - (from?.z ?? 0);
    if (dxFrom * dxFrom + dzFrom * dzFrom <= COMBAT_VFX_RADIUS2) return true;
    if (to) {
      const dxTo = pos.x - (to.x ?? 0);
      const dzTo = pos.z - (to.z ?? 0);
      if (dxTo * dxTo + dzTo * dzTo <= COMBAT_VFX_RADIUS2) return true;
    }
    if (center && center !== from) {
      const dxC = pos.x - (center.x ?? 0);
      const dzC = pos.z - (center.z ?? 0);
      if (dxC * dxC + dzC * dzC <= COMBAT_VFX_RADIUS2) return true;
    }
    return false;
  }

  /**
   * @param {CombatEvent | null | undefined} event
   * @param {number} [now]
   */
  function broadcastCombatEvent(event, now = Date.now()) {
    if (!event) return;
    const payload = JSON.stringify({ type: 'combatEvent', t: now, events: [event] });
    for (const other of players.values()) {
      if (!other?.pos) continue;
      if (!shouldReceiveCombatEvent(other.pos, event)) continue;
      safeSendRaw(other.ws, payload);
    }
  }

  server.on('upgrade', (/** @type {WsUpgradeRequest} */ req, socket, head) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const ip = getRemoteAddress(req, config.trustProxy);
    if (!canAcceptConnection(ip)) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (/** @type {WsClient} */ ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (/** @type {WsClient} */ ws, /** @type {WsUpgradeRequest} */ req) => {
    const ip = getRemoteAddress(req, config.trustProxy);
    trackConnection(ip);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const allowMessage = createMessageLimiter(
      config.msgRateMax,
      config.msgRateIntervalMs
    );
    const chatRateMax = config.chat?.rateLimitMax ?? 5;
    const chatRateIntervalMs = config.chat?.rateLimitIntervalMs ?? 10_000;
    const allowChatMessage = createMessageLimiter(chatRateMax, chatRateIntervalMs);
    let /** @type {ServerPlayer | null} */ player = null;
    let /** @type {string | null} */ playerId = null;
    let tracked = true;

    const cleanupConnection = () => {
      if (!tracked) return;
      untrackConnection(ip);
      tracked = false;
    };

    ws.on('error', () => {
      ws.terminate?.();
    });

    ws.on('close', () => {
      const isCurrent = Boolean(player && playerId && players.get(playerId) === player);
      if (isCurrent) {
        const currentPlayer = /** @type {ServerPlayer} */ (player);
        const currentPlayerId = /** @type {string} */ (playerId);
        lastSentByPlayer.delete(currentPlayerId);
        const duelOpponent = endDuel(currentPlayer, players);
        if (duelOpponent) {
          persistence.markDirty(duelOpponent);
          if (duelOpponent.ws) {
            safeSend(duelOpponent.ws, { type: 'duelEnded', reason: 'disconnect' });
            sendPrivateState(duelOpponent.ws, duelOpponent, Date.now());
          }
        }
        const tradePartner = getTradePartner(currentPlayer);
        if (tradePartner) {
          endTradeSession(currentPlayer, true);
          persistence.markDirty(tradePartner);
          if (tradePartner.ws) {
            safeSend(tradePartner.ws, { type: 'tradeCancelled' });
            sendPrivateState(tradePartner.ws, tradePartner, Date.now());
          }
        }
        leaveParty(currentPlayerId, players);
        players.delete(currentPlayerId);
      }
      cleanupConnection();
      if (isCurrent && player && !player.isGuest) {
        persistence.persistPlayer(player).catch((/** @type {unknown} */ err) => {
          console.error('Failed to persist player on disconnect:', err);
        });
      }
    });

    (async () => {
      const { characterId, guest, ticket } = parseConnectionParams(req);
      const spawn = spawner.getSpawnPoint();

      let /** @type {StoredCharacter | null} */ stored = null;
      let /** @type {AuthAccount | null} */ account = null;
      let /** @type {string | null} */ id = null;

      if (!guest) {
        let /** @type {WsTicketData | null} */ ticketData = null;
        if (ticket) {
          ticketData = validateAndConsumeTicket(ticket);
        }

        if (ticketData) {
          if (ticketData.characterId !== characterId) {
            ws.close?.(1008, 'Invalid ticket');
            cleanupConnection();
            return;
          }
          try {
            stored = await loadPlayer(characterId);
          } catch (err) {
            console.error('Failed to load player from DB:', err);
            ws.close?.(1011, 'DB unavailable');
            cleanupConnection();
            return;
          }
          if (!stored || stored.accountId !== ticketData.accountId) {
            ws.close?.(1008, 'Character not found');
            cleanupConnection();
            return;
          }
          account = { id: ticketData.accountId };
          id = stored.id;
          updateAccountLastSeen(account.id, new Date()).catch(() => {});
        } else {
          const token = normalizeId(getCookieValue(req, config.sessionCookieName));
          if (!token || !characterId) {
            ws.close?.(1008, 'Auth required');
            cleanupConnection();
            return;
          }

          let session;
          try {
            session = await getSessionWithAccount(token);
          } catch (err) {
            console.error('Failed to load session:', err);
            ws.close?.(1011, 'Auth unavailable');
            cleanupConnection();
            return;
          }

          if (!session || !session.account) {
            ws.close?.(1008, 'Unauthorized');
            cleanupConnection();
            return;
          }

          const now = new Date();
          if (session.expiresAt && session.expiresAt <= now) {
            ws.close?.(1008, 'Session expired');
            cleanupConnection();
            return;
          }

          account = session.account;
          try {
            stored = await loadPlayer(characterId);
          } catch (err) {
            console.error('Failed to load player from DB:', err);
            ws.close?.(1011, 'DB unavailable');
            cleanupConnection();
            return;
          }

          if (!stored || stored.accountId !== account.id) {
            ws.close?.(1008, 'Character not found');
            cleanupConnection();
            return;
          }

          id = stored.id;
          touchSession(token, now).catch(() => {});
          updateAccountLastSeen(account.id, now).catch(() => {});
        }
      } else {
        id = generatePlayerId();
      }

      if (!id) {
        ws.close?.(1011, 'Server error');
        cleanupConnection();
        return;
      }
      playerId = id;

      let /** @type {ServerPlayer} */ basePlayer;
      if (stored?.state) {
        const migrated = migratePlayerState(stored.state, stored.stateVersion);
        const hydrated = hydratePlayerState(migrated.state, world, spawn);
        basePlayer = createRuntimePlayer({
          id,
          ws,
          state: hydrated,
          accountId: stored.accountId,
          name: stored.name,
          nameLower: stored.nameLower,
        });
        initCombatState(basePlayer);

        if (!guest && migrated.didUpgrade) {
          const upgradedState = serializePlayerState(basePlayer);
          savePlayer(basePlayer, upgradedState, new Date()).catch((/** @type {unknown} */ err) => {
            console.error('Failed to persist migrated player state:', err);
          });
        }
      } else {
        const baseState = createBasePlayerState({
          world,
          spawn,
          classId: DEFAULT_CLASS_ID,
        });
        basePlayer = createRuntimePlayer({
          id,
          ws,
          state: baseState,
          accountId: account?.id,
          name: stored?.name,
          nameLower: stored?.nameLower,
        });
        initCombatState(basePlayer);
      }

      const existing = players.get(id);
      if (existing && existing.ws !== ws) {
        try {
          existing.ws?.close?.(4001, 'Replaced by new connection');
        } catch {
          // ignore close errors
        }
      }

      basePlayer.isGuest = guest;
      basePlayer.persistId = id;
      basePlayer.persistAccountId = basePlayer.accountId ?? null;
      basePlayer.persistName = basePlayer.name ?? null;
      basePlayer.persistNameLower = basePlayer.nameLower ?? null;
      persistence.initPlayerPersistence(basePlayer, Date.now());
      basePlayer.connectionId = generatePlayerId();

      players.set(id, basePlayer);
      player = basePlayer;

      const now = Date.now();
      const initialState = buildPublicStateForPlayer(basePlayer, now);
      lastSentByPlayer.set(id, initialState);
      safeSend(ws, {
        type: 'welcome',
        id,
        snapshot: {
          ...initialState,
          world: worldSnapshot(world),
        },
        config: config.configSnapshot,
      });
      sendPrivateState(ws, player, now);

      const msgHandlers = createMessageHandlers();

      ws.on('message', (/** @type {unknown} */ data) => {
        if (!player) return;
        if (!allowMessage()) {
          ws.close?.(1008, 'Rate limit');
          return;
        }

        let raw;
        try {
          raw = JSON.parse(String(data));
        } catch {
          return;
        }

        const msg = parseClientMessage(raw);
        if (!msg) return;

        const seq =
          typeof msg.seq === 'number' && Number.isInteger(msg.seq) ? msg.seq : null;
        const lastInputSeq = player.lastInputSeq ?? 0;
        if (seq !== null && seq <= lastInputSeq) {
          return;
        }

        if (seq !== null) {
          player.lastInputSeq = seq;
        }

        if (player.dead && msg.type !== 'respawn' && msg.type !== 'ping') return;

        /** @type {WsMessageHandlerContext} */
        const ctx = {
          player,
          players,
          mobs,
          resources,
          corpses,
          world,
          config,
          spawner,
          persistence,
          msg,
          ws,
          safeSend,
          sendPrivateState,
          broadcastCombatEvent,
          allowChatMessage,
          initCombatState,
          countInventory,
          nextItemIdRef,
        };
        for (const [match, handle] of msgHandlers) {
          if (match(msg)) {
            handle(ctx);
            return;
          }
        }
      });
    })().catch((/** @type {unknown} */ err) => {
      console.error('Failed to initialize connection:', err);
      ws.close?.(1011, 'Server error');
      cleanupConnection();
    });
  });

  let /** @type {NodeJS.Timeout | null} */ heartbeatId = null;
  function startHeartbeat() {
    if (heartbeatId) return;
    heartbeatId = setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, config.heartbeatIntervalMs);
    heartbeatId.unref?.();
  }

  function stopHeartbeat() {
    if (!heartbeatId) return;
    clearInterval(heartbeatId);
    heartbeatId = null;
  }

  let /** @type {NodeJS.Timeout | null} */ broadcastId = null;
  const broadcastIntervalMs = 1000 / config.broadcastHz;
  function startBroadcast() {
    if (broadcastId) return;
    broadcastId = setInterval(() => {
      if (players.size === 0) return;
      const now = Date.now();
      for (const player of players.values()) {
        const currentState = buildPublicStateForPlayer(player, now);
        const stateToSend = buildDeltaState(player, currentState, now);
        lastSentByPlayer.set(player.id, currentState);
        safeSendRaw(player.ws, JSON.stringify(stateToSend));
        sendPrivateState(player.ws, player, now);
      }
    }, broadcastIntervalMs);
  }

  function stopBroadcast() {
    if (!broadcastId) return;
    clearInterval(broadcastId);
    broadcastId = null;
  }

  /**
   * @param {number} [code]
   * @param {string} [reason]
   */
  function closeAll(code = 1001, reason = 'Server shutdown') {
    for (const client of wss.clients) {
      try {
        client.close(code, reason);
      } catch {
        // ignore close errors
      }
    }
  }

  /**
   * @param {string} playerId
   * @param {Array<{ kind: string, text: string, t: number }>} entries
   */
  function sendCombatLogToPlayer(playerId, entries) {
    sendCombatLog(players, playerId, entries, safeSend);
  }

  /**
   * @param {ServerPlayer | null | undefined} player
   * @param {ServerPlayer | null | undefined} opponent
   * @param {string} reason
   */
  function notifyDuelEnded(player, opponent, reason) {
    const now = Date.now();
    if (player?.ws) {
      safeSend(player.ws, { type: 'duelEnded', reason });
      sendPrivateState(player.ws, player, now);
    }
    if (opponent?.ws) {
      safeSend(opponent.ws, { type: 'duelEnded', reason });
      sendPrivateState(opponent.ws, opponent, now);
    }
  }

  return {
    wss,
    startHeartbeat,
    stopHeartbeat,
    startBroadcast,
    stopBroadcast,
    closeAll,
    sendCombatLogToPlayer,
    broadcastCombatEvent,
    notifyDuelEnded,
  };
}
