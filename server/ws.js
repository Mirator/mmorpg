import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { parseClientMessage } from '../shared/protocol.js';
import { getSellPriceCopper } from '../shared/economy.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../shared/classes.js';
import {
  serializePlayersPublic,
  serializePlayerPrivate,
  serializeResources,
  serializeMobs,
} from './admin.js';
import { worldSnapshot } from './logic/world.js';
import { tryHarvest } from './logic/resources.js';
import { tryBasicAttack } from './logic/combat.js';
import {
  countInventory,
  createInventory,
  swapInventorySlots,
} from './logic/inventory.js';
import { loadPlayer, createPlayer, savePlayer } from './db/playerRepo.js';
import { hydratePlayerState, migratePlayerState, serializePlayerState } from './db/playerState.js';

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

function normalizePlayerId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return null;
  return trimmed;
}

function generatePlayerId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseConnectionParams(req) {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const playerId = normalizePlayerId(url.searchParams.get('playerId'));
    const guest = url.searchParams.get('guest') === '1';
    return { playerId, guest };
  } catch {
    return { playerId: null, guest: false };
  }
}

export function createWebSocketServer({
  server,
  config,
  world,
  resources,
  mobs,
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
  let nextItemId = 1;

  function isAllowedOrigin(origin) {
    if (!origin) return config.allowNoOrigin;
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

  function buildPublicState(now) {
    return {
      type: 'state',
      t: now,
      players: serializePlayersPublic(players),
      resources: serializeResources(resources),
      mobs: serializeMobs(mobs),
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
      const { playerId: requestedId, guest } = parseConnectionParams(req);
      const id = requestedId ?? generatePlayerId();
      playerId = id;
      const spawn = spawner.getSpawnPoint();

      let stored = null;
      if (!guest) {
        try {
          stored = await loadPlayer(id);
        } catch (err) {
          console.error('Failed to load player from DB:', err);
          ws.close(1011, 'DB unavailable');
          cleanupConnection();
          return;
        }
      }

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
          dead: false,
          respawnAt: 0,
          classId: hydrated.classId,
          level: hydrated.level,
          xp: hydrated.xp,
          attackCooldownUntil: 0,
        };

        if (!guest && migrated.didUpgrade) {
          const upgradedState = serializePlayerState(basePlayer);
          savePlayer(id, upgradedState, new Date()).catch((err) => {
            console.error('Failed to persist migrated player state:', err);
          });
        }
      } else {
        basePlayer = {
          id,
          ws,
          pos: { x: spawn.x, y: 0, z: spawn.z },
          target: null,
          keys: { w: false, a: false, s: false, d: false },
          lastInputSeq: 0,
          hp: world.playerMaxHp,
          maxHp: world.playerMaxHp,
          inv: 0,
          invCap: world.playerInvCap,
          invSlots: world.playerInvSlots,
          invStackMax: world.playerInvStackMax,
          inventory: createInventory(world.playerInvSlots),
          currencyCopper: 0,
          dead: false,
          respawnAt: 0,
          classId: DEFAULT_CLASS_ID,
          level: 1,
          xp: 0,
          attackCooldownUntil: 0,
        };
        if (!guest) {
          try {
            await createPlayer(id, serializePlayerState(basePlayer), new Date());
          } catch (err) {
            console.error('Failed to create player record:', err);
          }
        }
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
      persistence.initPlayerPersistence(basePlayer, Date.now());
      basePlayer.connectionId = generatePlayerId();

      players.set(id, basePlayer);
      player = basePlayer;

      const now = Date.now();
      safeSend(ws, {
        type: 'welcome',
        id,
        snapshot: {
          t: now,
          world: worldSnapshot(world),
          players: serializePlayersPublic(players),
          resources: serializeResources(resources),
          mobs: serializeMobs(mobs),
        },
        config: config.configSnapshot,
      });
      sendPrivateState(ws, player, now);

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

        if (player.dead) return;

        if (msg.type === 'input') {
          player.keys = msg.keys;
          return;
        }

        if (msg.type === 'moveTarget') {
          player.target = { x: msg.x, z: msg.z };
          return;
        }

        if (msg.type === 'action' && msg.kind === 'interact') {
          const harvested = tryHarvest(resources, player, Date.now(), {
            harvestRadius: config.resource.harvestRadius,
            respawnMs: config.resource.respawnMs,
            stackMax: player.invStackMax,
            itemKind: 'crystal',
            itemName: 'Crystal',
            makeItem: () => ({
              id: `i${nextItemId++}`,
              kind: 'crystal',
              name: 'Crystal',
              count: 1,
            }),
          });
          if (harvested) {
            persistence.markDirty(player);
          }
          return;
        }

        if (msg.type === 'classSelect') {
          if (!isValidClassId(msg.classId)) return;
          player.classId = msg.classId;
          persistence.markDirty(player);
          return;
        }

        if (msg.type === 'inventorySwap') {
          const swapped = swapInventorySlots(player.inventory, msg.from, msg.to);
          if (swapped) {
            persistence.markDirty(player);
          }
          return;
        }

        if (msg.type === 'action' && msg.kind === 'ability') {
          if (msg.slot !== 1) return;
          const result = tryBasicAttack({
            player,
            mobs,
            now: Date.now(),
            respawnMs: config.mob.respawnMs,
          });
          if (result.xpGain > 0 || result.leveledUp) {
            persistence.markDirty(player);
          }
          return;
        }

        if (msg.type === 'vendorSell') {
          const vendor = world.vendors?.find((v) => v.id === msg.vendorId);
          if (!vendor) return;
          if (msg.slot < 0 || msg.slot >= player.inventory.length) return;
          const item = player.inventory[msg.slot];
          if (!item) return;
          const dist = Math.hypot(player.pos.x - vendor.x, player.pos.z - vendor.z);
          const maxDist = world.vendorInteractRadius ?? 2.5;
          if (dist > maxDist) return;
          const unitPrice = getSellPriceCopper(item.kind);
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
          const count = Math.max(1, Number(item.count) || 1);
          const total = Math.floor(unitPrice * count);
          player.inventory[msg.slot] = null;
          player.inv = countInventory(player.inventory);
          player.currencyCopper = (player.currencyCopper ?? 0) + total;
          persistence.markDirty(player);
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
      const state = buildPublicState(now);
      const stateString = JSON.stringify(state);
      for (const player of players.values()) {
        safeSendRaw(player.ws, stateString);
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

  return {
    wss,
    startHeartbeat,
    stopHeartbeat,
    startBroadcast,
    stopBroadcast,
    closeAll,
  };
}
