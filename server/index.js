import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { stepPlayer } from './logic/movement.js';
import { createWorld, worldSnapshot } from './logic/world.js';
import { applyCollisions } from './logic/collision.js';
import { createResources, stepResources, tryHarvest } from './logic/resources.js';
import { createMobs, getMobMaxHp, stepMobs } from './logic/mobs.js';
import { tryBasicAttack } from './logic/combat.js';
import {
  countInventory,
  clearInventory,
  createInventory,
  swapInventorySlots,
} from './logic/inventory.js';
import { getSellPriceCopper } from '../shared/economy.js';
import {
  createAdminStateHandler,
  resolveAdminPassword,
  serializePlayersPublic,
  serializePlayerPrivate,
  serializeResources,
  serializeMobs,
} from './admin.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../shared/classes.js';
import { loadPlayer, createPlayer, savePlayer } from './db/playerRepo.js';
import { hydratePlayerState, serializePlayerState } from './db/playerState.js';

const app = express();
app.disable('x-powered-by');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const ADMIN_DIR = path.resolve(__dirname, '../admin');
const SHARED_DIR = path.resolve(__dirname, '../shared');

const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3000;
const HOST = process.env.HOST ?? '127.0.0.1';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
if (TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const MAX_CONNECTIONS_PER_IP =
  Number.parseInt(process.env.MAX_CONNECTIONS_PER_IP ?? '', 10) || 5;
const MAX_PAYLOAD_BYTES =
  Number.parseInt(process.env.MAX_PAYLOAD_BYTES ?? '', 10) || 16 * 1024;
const MSG_RATE_MAX = Number.parseInt(process.env.MSG_RATE_MAX ?? '', 10) || 60;
const MSG_RATE_INTERVAL_MS =
  Number.parseInt(process.env.MSG_RATE_INTERVAL_MS ?? '', 10) || 1000;
const HEARTBEAT_INTERVAL_MS =
  Number.parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '', 10) || 30_000;
const PERSIST_INTERVAL_MS =
  Number.parseInt(process.env.PERSIST_INTERVAL_MS ?? '', 10) || 5000;
const ALLOW_NO_ORIGIN = process.env.ALLOW_NO_ORIGIN === 'true';
const ADMIN_PASSWORD = resolveAdminPassword();

const defaultOrigins = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
]);
const allowedOrigins = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS,
  defaultOrigins
);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});
app.use('/admin', express.static(ADMIN_DIR));
app.use('/shared', express.static(SHARED_DIR));
app.use(express.static(CLIENT_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_PAYLOAD_BYTES,
  perMessageDeflate: false,
});

const players = new Map();
const connectionsByIp = new Map();
let nextSpawnIndex = 0;
let nextItemId = 1;

const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const BROADCAST_HZ = 20;
const BROADCAST_INTERVAL_MS = 1000 / BROADCAST_HZ;

const PLAYER_RADIUS = 0.6;
const RESPAWN_MS = 5000;
const E2E_TEST = process.env.E2E_TEST === 'true';
const PERSIST_POS_EPS = 0.6;
const PERSIST_FORCE_MS = 30_000;

const world = createWorld();
const resources = createResources(world.resourceNodes);
const mobs = createMobs(world.mobCount, world);
const CONFIG = { speed: world.playerSpeed, targetEpsilon: 0.1 };

const resourceConfig = {
  harvestRadius: world.harvestRadius,
  respawnMs: world.resourceRespawnMs,
};

const mobConfig = {
  mobRadius: 0.8,
  respawnMs: world.mobRespawnMs ?? 10_000,
  attackDamageBase: 6,
  attackDamagePerLevel: 2,
};

app.get(
  '/admin/state',
  createAdminStateHandler({
    password: ADMIN_PASSWORD,
    world,
    players,
    resources,
    mobs,
  })
);

if (E2E_TEST) {
  const testResource = {
    id: 'r-test',
    x: world.base.x + world.base.radius + 6,
    z: world.base.z,
  };
  resources.unshift({
    id: testResource.id,
    x: testResource.x,
    z: testResource.z,
    available: true,
    respawnAt: 0,
  });
  const testMobLevel = 4;
  const testMobMaxHp = getMobMaxHp(testMobLevel);
  const testMob = {
    id: 'm-test',
    pos: {
      x: world.base.x + world.base.radius + 30,
      y: 0,
      z: world.base.z,
    },
    state: 'idle',
    targetId: null,
    nextDecisionAt: 0,
    dir: { x: 1, z: 0 },
    attackCooldownUntil: Number.MAX_SAFE_INTEGER,
    level: testMobLevel,
    hp: testMobMaxHp,
    maxHp: testMobMaxHp,
    dead: false,
    respawnAt: 0,
  };
  mobs.unshift(testMob);
}

function getSpawnPoint() {
  const point = world.spawnPoints[nextSpawnIndex % world.spawnPoints.length];
  nextSpawnIndex += 1;
  return { x: point.x, z: point.z };
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

function sendPrivateState(ws, player, now) {
  safeSend(ws, {
    type: 'me',
    t: now,
    data: serializePlayerPrivate(player),
    id: player.id,
  });
}

function sanitizeKeys(raw) {
  return {
    w: !!raw?.w,
    a: !!raw?.a,
    s: !!raw?.s,
    d: !!raw?.d,
  };
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIp(ip) {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function getRemoteAddress(req) {
  if (TRUST_PROXY) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return normalizeIp(xf.split(',')[0].trim());
    }
  }
  return normalizeIp(req.socket.remoteAddress ?? 'unknown');
}

function canAcceptConnection(ip) {
  return (connectionsByIp.get(ip) ?? 0) < MAX_CONNECTIONS_PER_IP;
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

function parseAllowedOrigins(raw, defaults) {
  if (!raw) return new Set(defaults);
  const parts = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : new Set(defaults);
}

function isAllowedOrigin(origin) {
  if (!origin) return ALLOW_NO_ORIGIN;
  return allowedOrigins.has(origin);
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

function markDirty(player) {
  if (!player || player.isGuest) return;
  player.dirty = true;
}

function shouldPersistPlayer(player, now) {
  if (!player || player.isGuest) return false;
  if (player.dirty) return true;
  const lastAt = Number(player.lastPersistedAt) || 0;
  if (now - lastAt >= PERSIST_FORCE_MS) return true;
  const lastPos = player.lastPersistedPos;
  if (!lastPos) return true;
  const dx = (player.pos?.x ?? 0) - lastPos.x;
  const dz = (player.pos?.z ?? 0) - lastPos.z;
  return Math.hypot(dx, dz) >= PERSIST_POS_EPS;
}

async function persistPlayer(player, now = Date.now()) {
  if (!player || player.isGuest) return;
  const state = serializePlayerState(player);
  await savePlayer(player.persistId ?? player.id, state, new Date(now));
  player.dirty = false;
  player.lastPersistedAt = now;
  player.lastPersistedPos = { x: player.pos?.x ?? 0, z: player.pos?.z ?? 0 };
}

function killPlayer(player, now) {
  if (player.dead) return;
  player.dead = true;
  player.respawnAt = now + RESPAWN_MS;
  player.inv = 0;
  clearInventory(player.inventory);
  player.target = null;
  player.keys = { w: false, a: false, s: false, d: false };
  markDirty(player);
}

function respawnPlayer(player) {
  const spawn = getSpawnPoint();
  player.pos = { x: spawn.x, y: 0, z: spawn.z };
  player.hp = player.maxHp;
  player.dead = false;
  player.respawnAt = 0;
  player.attackCooldownUntil = 0;
  markDirty(player);
}

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const ip = getRemoteAddress(req);
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
  const ip = getRemoteAddress(req);
  trackConnection(ip);

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  const allowMessage = createMessageLimiter(MSG_RATE_MAX, MSG_RATE_INTERVAL_MS);
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
      persistPlayer(player).catch((err) => {
        console.error('Failed to persist player on disconnect:', err);
      });
    }
  });

  (async () => {
    const { playerId: requestedId, guest } = parseConnectionParams(req);
    const id = requestedId ?? generatePlayerId();
    playerId = id;
    const spawn = getSpawnPoint();

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
      const hydrated = hydratePlayerState(stored.state, world, spawn);
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
    basePlayer.dirty = false;
    basePlayer.lastPersistedAt = Date.now();
    basePlayer.lastPersistedPos = { x: basePlayer.pos.x, z: basePlayer.pos.z };
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
    });
    sendPrivateState(ws, player, now);

    ws.on('message', (data) => {
      if (!allowMessage()) {
        ws.close(1008, 'Rate limit');
        return;
      }

      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (!isPlainObject(msg)) return;

      if (!Number.isSafeInteger(msg.seq) && msg.seq !== undefined) {
        return;
      }

      if (Number.isSafeInteger(msg.seq) && msg.seq <= player.lastInputSeq) {
        return;
      }

      if (Number.isSafeInteger(msg.seq)) {
        player.lastInputSeq = msg.seq;
      }

      if (player.dead) return;

      if (msg.type === 'input') {
        player.keys = sanitizeKeys(msg.keys);
        return;
      }

      if (msg.type === 'moveTarget') {
        const x = Number(msg.x);
        const z = Number(msg.z);
        if (Number.isFinite(x) && Number.isFinite(z)) {
          player.target = { x, z };
        }
        return;
      }

      if (msg.type === 'action' && msg.kind === 'interact') {
        const harvested = tryHarvest(resources, player, Date.now(), {
          harvestRadius: resourceConfig.harvestRadius,
          respawnMs: resourceConfig.respawnMs,
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
          markDirty(player);
        }
        return;
      }

      if (msg.type === 'classSelect') {
        const classId = typeof msg.classId === 'string' ? msg.classId : '';
        if (!isValidClassId(classId)) return;
        player.classId = classId;
        markDirty(player);
        return;
      }

      if (msg.type === 'inventorySwap') {
        const from = Number(msg.from);
        const to = Number(msg.to);
        if (Number.isInteger(from) && Number.isInteger(to)) {
          const swapped = swapInventorySlots(player.inventory, from, to);
          if (swapped) {
            markDirty(player);
          }
        }
        return;
      }

      if (msg.type === 'action' && msg.kind === 'ability') {
        const slot = Number(msg.slot);
        if (!Number.isInteger(slot)) return;
        if (slot !== 1) return;
        const result = tryBasicAttack({
          player,
          mobs,
          now: Date.now(),
          respawnMs: mobConfig.respawnMs ?? 10_000,
        });
        if (result.xpGain > 0 || result.leveledUp) {
          markDirty(player);
        }
        return;
      }

      if (msg.type === 'vendorSell') {
        const slot = Number(msg.slot);
        const vendorId = typeof msg.vendorId === 'string' ? msg.vendorId : '';
        const vendor = world.vendors?.find((v) => v.id === vendorId);
        if (!vendor) return;
        if (!Number.isInteger(slot) || slot < 0 || slot >= player.inventory.length) return;
        const item = player.inventory[slot];
        if (!item) return;
        const dist = Math.hypot(player.pos.x - vendor.x, player.pos.z - vendor.z);
        const maxDist = world.vendorInteractRadius ?? 2.5;
        if (dist > maxDist) return;
        const unitPrice = getSellPriceCopper(item.kind);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
        const count = Math.max(1, Number(item.count) || 1);
        const total = Math.floor(unitPrice * count);
        player.inventory[slot] = null;
        player.inv = countInventory(player.inventory);
        player.currencyCopper = (player.currencyCopper ?? 0) + total;
        markDirty(player);
        return;
      }
    });
  })().catch((err) => {
    console.error('Failed to initialize connection:', err);
    ws.close(1011, 'Server error');
    cleanupConnection();
  });
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

heartbeat.unref?.();

let persistRunning = false;
const persistInterval = setInterval(() => {
  if (persistRunning) return;
  persistRunning = true;
  const now = Date.now();
  const pending = [];
  for (const player of players.values()) {
    if (!shouldPersistPlayer(player, now)) continue;
    pending.push(
      persistPlayer(player, now).catch((err) => {
        console.error('Failed to persist player:', err);
        player.dirty = true;
      })
    );
  }
  Promise.allSettled(pending).finally(() => {
    persistRunning = false;
  });
}, PERSIST_INTERVAL_MS);

persistInterval.unref?.();

setInterval(() => {
  const now = Date.now();

  for (const player of players.values()) {
    if (player.dead) {
      if (player.respawnAt && now >= player.respawnAt) {
        respawnPlayer(player);
      }
      continue;
    }

    const result = stepPlayer(
      { pos: player.pos, target: player.target },
      { keys: player.keys },
      DT,
      CONFIG
    );
    player.pos = applyCollisions(result.pos, world, PLAYER_RADIUS);
    player.target = result.target;

  }

  stepResources(resources, now);
  stepMobs(mobs, Array.from(players.values()), world, DT, now, mobConfig);

  for (const player of players.values()) {
    if (!player.dead && player.hp <= 0) {
      killPlayer(player, now);
    }
  }
}, DT * 1000);

setInterval(() => {
  if (players.size === 0) return;
  const now = Date.now();
  const state = buildPublicState(now);
  const stateString = JSON.stringify(state);
  for (const player of players.values()) {
    safeSendRaw(player.ws, stateString);
    sendPrivateState(player.ws, player, now);
  }
}, BROADCAST_INTERVAL_MS);

server.on('error', (err) => {
  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    console.error(
      `Failed to bind http://${HOST}:${PORT}. ` +
        'Permission denied; try a different HOST/PORT or check sandbox restrictions.'
    );
    return;
  }
  console.error('Server error:', err);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
