import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '../shared/protocol.js';
import {
  DEFAULT_CLASS_ID,
  isValidClassId,
  getResourceForClass,
} from '../shared/classes.js';
import { computeDerivedStats } from '../shared/attributes.js';
import {
  serializePlayersPublic,
  serializePlayerPrivate,
  serializeResources,
  serializeMobs,
  serializeCorpses,
} from './admin.js';
import { worldSnapshot } from './logic/world.js';
import { countInventory } from './logic/inventory.js';
import { loadPlayer, savePlayer } from './db/playerRepo.js';
import { hydratePlayerState, migratePlayerState, serializePlayerState } from './db/playerState.js';
import { createBasePlayerState, respawnPlayer } from './logic/players.js';
import { getSessionWithAccount, touchSession } from './db/sessionRepo.js';
import { updateAccountLastSeen } from './db/accountRepo.js';
import { addMessage as addChatMessage } from './logic/chat.js';
import { sendCombatLog } from './logic/combatLog.js';
import { leaveParty, getPartyForPlayer } from './logic/party.js';
import { validateAndConsumeTicket } from './wsTicket.js';
import { createMessageHandlers } from './ws/handlers/index.js';

function safeSend(ws, msg) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    // Ignore send errors for closing sockets.
  }
}

function safeSendRaw(ws, data) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(data);
  } catch {
    // Ignore send errors for closing sockets.
  }
}

function normalizeIp(ip) {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function getRemoteAddress(req, trustProxy) {
  if (trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return normalizeIp(xf.split(',')[0].trim());
    }
  }
  return normalizeIp(req.socket.remoteAddress ?? 'unknown');
}

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

function normalizeId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

function getCookieValue(req, name) {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : '';
  }
  return null;
}

function generatePlayerId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

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
}) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadBytes,
    perMessageDeflate: false,
  });

  const connectionsByIp = new Map();
  const nextItemIdRef = { current: 1 };

  function isAllowedOrigin(origin) {
    if (!origin) {
      if (!config.allowNoOrigin) return false;
      return config.allowNoOriginRemote || config.isLocalhost;
    }
    return config.allowedOrigins.has(origin);
  }

  function canAcceptConnection(ip) {
    return (connectionsByIp.get(ip) ?? 0) < config.maxConnectionsPerIp;
  }

  function trackConnection(ip) {
    connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
  }

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

  function isInAOI(pos, centerPos, radius2 = aoiRadius2) {
    if (!pos || !centerPos) return false;
    const dx = (pos.x ?? 0) - (centerPos.x ?? 0);
    const dz = (pos.z ?? 0) - (centerPos.z ?? 0);
    return dx * dx + dz * dz <= radius2;
  }

  function getPartyMemberIds(playerId) {
    const party = getPartyForPlayer(playerId, players);
    return party ? party.memberIds : [];
  }

  function filterPlayersByAOI(playersMap, centerPos, includeIds) {
    const out = {};
    const includeSet = new Set(includeIds ?? []);
    for (const [id, p] of playersMap.entries()) {
      if (!p?.pos) continue;
      if (includeSet.has(id) || isInAOI(p.pos, centerPos)) {
        out[id] = {
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          hp: p.hp,
          maxHp: p.maxHp,
          inv: p.inv,
          currencyCopper: p.currencyCopper ?? 0,
          dead: p.dead,
          classId: p.classId ?? null,
          level: p.level ?? 1,
          name: p.name ?? null,
        };
      }
    }
    return out;
  }

  function filterResourcesByAOI(resourcesArr, centerPos) {
    return resourcesArr.filter((r) =>
      isInAOI({ x: r.x, z: r.z }, centerPos)
    );
  }

  function filterMobsByAOI(mobsArr, centerPos) {
    return mobsArr.filter((m) =>
      isInAOI(m?.pos ?? { x: m.x, z: m.z }, centerPos)
    );
  }

  function filterCorpsesByAOI(corpsesArr, centerPos) {
    if (!Array.isArray(corpsesArr)) return [];
    return corpsesArr.filter((c) => {
      const pos = c?.pos ?? { x: c?.x, z: c?.z };
      return isInAOI(pos, centerPos);
    });
  }

  function buildPublicStateForPlayer(player, now) {
    const pos = player?.pos ?? { x: 0, z: 0 };
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

  const lastSentByPlayer = new Map();
  const DELTA_FULL_THRESHOLD = 0.8;

  function entityChanged(a, b) {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  function buildDeltaState(player, currentState, now) {
    const last = lastSentByPlayer.get(player.id);
    if (!last) {
      return { ...currentState, full: true };
    }

    const deltaPlayers = {};
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

    const deltaResources = [];
    const removedResources = [];
    const resourceById = (arr) => {
      const m = new Map();
      for (const r of arr ?? []) m.set(r.id, r);
      return m;
    };
    const lastResMap = resourceById(last.resources);
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

    const deltaMobs = [];
    const removedMobs = [];
    const lastMobMap = resourceById(last.mobs);
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

    const deltaCorpses = [];
    const removedCorpses = [];
    const lastCorpseMap = resourceById(last.corpses);
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

  function buildPublicState(now) {
    return {
      type: 'state',
      t: now,
      players: serializePlayersPublic(players),
      resources: serializeResources(resources),
      mobs: serializeMobs(mobs),
      corpses: serializeCorpses(corpses ?? []),
    };
  }

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

  function broadcastCombatEvent(event, now = Date.now()) {
    if (!event) return;
    const payload = JSON.stringify({ type: 'combatEvent', t: now, events: [event] });
    for (const other of players.values()) {
      if (!other?.pos) continue;
      if (!shouldReceiveCombatEvent(other.pos, event)) continue;
      safeSendRaw(other.ws, payload);
    }
  }

  server.on('upgrade', (req, socket, head) => {
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

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
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
    let player = null;
    let playerId = null;
    let tracked = true;

    const cleanupConnection = () => {
      if (!tracked) return;
      untrackConnection(ip);
      tracked = false;
    };

    ws.on('error', () => {
      ws.terminate();
    });

    ws.on('close', () => {
      const isCurrent = player && players.get(playerId) === player;
      if (isCurrent) {
        lastSentByPlayer.delete(playerId);
        leaveParty(playerId, players);
        players.delete(playerId);
      }
      cleanupConnection();
      if (isCurrent && player && !player.isGuest) {
        persistence.persistPlayer(player).catch((err) => {
          console.error('Failed to persist player on disconnect:', err);
        });
      }
    });

    (async () => {
      const { characterId, guest, ticket } = parseConnectionParams(req);
      const spawn = spawner.getSpawnPoint();

      let stored = null;
      let account = null;
      let id = null;

      if (!guest) {
        let ticketData = null;
        if (ticket) {
          ticketData = validateAndConsumeTicket(ticket);
        }

        if (ticketData) {
          if (ticketData.characterId !== characterId) {
            ws.close(1008, 'Invalid ticket');
            cleanupConnection();
            return;
          }
          try {
            stored = await loadPlayer(characterId);
          } catch (err) {
            console.error('Failed to load player from DB:', err);
            ws.close(1011, 'DB unavailable');
            cleanupConnection();
            return;
          }
          if (!stored || stored.accountId !== ticketData.accountId) {
            ws.close(1008, 'Character not found');
            cleanupConnection();
            return;
          }
          account = { id: ticketData.accountId };
          id = stored.id;
          updateAccountLastSeen(account.id, new Date()).catch(() => {});
        } else {
          const token = normalizeId(getCookieValue(req, config.sessionCookieName));
          if (!token || !characterId) {
            ws.close(1008, 'Auth required');
            cleanupConnection();
            return;
          }

          let session;
          try {
            session = await getSessionWithAccount(token);
          } catch (err) {
            console.error('Failed to load session:', err);
            ws.close(1011, 'Auth unavailable');
            cleanupConnection();
            return;
          }

          if (!session || !session.account) {
            ws.close(1008, 'Unauthorized');
            cleanupConnection();
            return;
          }

          const now = new Date();
          if (session.expiresAt && session.expiresAt <= now) {
            ws.close(1008, 'Session expired');
            cleanupConnection();
            return;
          }

          account = session.account;
          try {
            stored = await loadPlayer(characterId);
          } catch (err) {
            console.error('Failed to load player from DB:', err);
            ws.close(1011, 'DB unavailable');
            cleanupConnection();
            return;
          }

          if (!stored || stored.accountId !== account.id) {
            ws.close(1008, 'Character not found');
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

      playerId = id;

      let basePlayer;
      if (stored?.state) {
        const migrated = migratePlayerState(stored.state, stored.stateVersion);
        const hydrated = hydratePlayerState(migrated.state, world, spawn);
        basePlayer = {
          id,
          ws,
          pos: hydrated.pos,
          target: null,
          keys: { w: false, a: false, s: false, d: false },
          lastInputSeq: 0,
          hp: hydrated.hp,
          maxHp: hydrated.maxHp,
          inv: hydrated.inv,
          invCap: hydrated.invCap,
          invSlots: hydrated.invSlots,
          invStackMax: hydrated.invStackMax,
          inventory: hydrated.inventory,
          currencyCopper: hydrated.currencyCopper,
          equipment: hydrated.equipment,
          dead: false,
          respawnAt: 0,
          targetId: null,
          classId: hydrated.classId,
          level: hydrated.level,
          xp: hydrated.xp,
          attackCooldownUntil: 0,
          accountId: stored.accountId ?? null,
          name: stored.name ?? null,
          nameLower: stored.nameLower ?? null,
          partyId: null,
        };
        initCombatState(basePlayer);

        if (!guest && migrated.didUpgrade) {
          const upgradedState = serializePlayerState(basePlayer);
          savePlayer(basePlayer, upgradedState, new Date()).catch((err) => {
            console.error('Failed to persist migrated player state:', err);
          });
        }
      } else {
        const baseState = createBasePlayerState({
          world,
          spawn,
          classId: DEFAULT_CLASS_ID,
        });
        basePlayer = {
          id,
          ws,
          pos: baseState.pos,
          target: null,
          keys: { w: false, a: false, s: false, d: false },
          lastInputSeq: 0,
          hp: baseState.hp,
          maxHp: baseState.maxHp,
          inv: baseState.inv,
          invCap: baseState.invCap,
          invSlots: baseState.invSlots,
          invStackMax: baseState.invStackMax,
          inventory: baseState.inventory,
          currencyCopper: baseState.currencyCopper,
          equipment: baseState.equipment,
          dead: false,
          respawnAt: 0,
          targetId: null,
          classId: baseState.classId,
          level: baseState.level,
          xp: baseState.xp,
          attackCooldownUntil: 0,
          accountId: account?.id ?? null,
          name: stored?.name ?? null,
          nameLower: stored?.nameLower ?? null,
          partyId: null,
        };
        initCombatState(basePlayer);
      }

      const existing = players.get(id);
      if (existing && existing.ws !== ws) {
        try {
          existing.ws.close(4001, 'Replaced by new connection');
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

      ws.on('message', (data) => {
        if (!allowMessage()) {
          ws.close(1008, 'Rate limit');
          return;
        }

        let raw;
        try {
          raw = JSON.parse(data.toString());
        } catch {
          return;
        }

        const msg = parseClientMessage(raw);
        if (!msg) return;

        if (Number.isInteger(msg.seq) && msg.seq <= player.lastInputSeq) {
          return;
        }

        if (Number.isInteger(msg.seq)) {
          player.lastInputSeq = msg.seq;
        }

        if (player.dead && msg.type !== 'respawn') return;

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
    })().catch((err) => {
      console.error('Failed to initialize connection:', err);
      ws.close(1011, 'Server error');
      cleanupConnection();
    });
  });

  let heartbeatId = null;
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

  let broadcastId = null;
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

  function closeAll(code = 1001, reason = 'Server shutdown') {
    for (const client of wss.clients) {
      try {
        client.close(code, reason);
      } catch {
        // ignore close errors
      }
    }
  }

  function sendCombatLogToPlayer(playerId, entries) {
    sendCombatLog(players, playerId, entries, safeSend);
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
  };
}
