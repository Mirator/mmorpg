import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { stepPlayer } from './logic/movement.js';
import { createWorld, worldSnapshot } from './logic/world.js';
import { applyCollisions } from './logic/collision.js';
import { createResources, stepResources, tryHarvest } from './logic/resources.js';
import { createMobs, stepMobs } from './logic/mobs.js';
import {
  clearInventory,
  createInventory,
  swapInventorySlots,
} from './logic/inventory.js';
import {
  createAdminStateHandler,
  resolveAdminPassword,
  serializePlayers,
  serializeResources,
  serializeMobs,
} from './admin.js';

const app = express();
app.disable('x-powered-by');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const ADMIN_DIR = path.resolve(__dirname, '../admin');

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
app.use(express.static(CLIENT_DIR));

const server = http.createServer(app);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_PAYLOAD_BYTES,
  perMessageDeflate: false,
});

const players = new Map();
const connectionsByIp = new Map();
let nextId = 1;
let nextSpawnIndex = 0;
let nextItemId = 1;

const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const BROADCAST_HZ = 20;
const BROADCAST_INTERVAL_MS = 1000 / BROADCAST_HZ;
const CONFIG = { speed: 3, targetEpsilon: 0.1 };

const PLAYER_RADIUS = 0.6;
const RESPAWN_MS = 5000;
const E2E_TEST = process.env.E2E_TEST === 'true';

const world = createWorld();
const resources = createResources(world.resourceNodes);
const mobs = createMobs(world.mobCount, world);

const resourceConfig = {
  harvestRadius: world.harvestRadius,
  respawnMs: world.resourceRespawnMs,
};

const mobConfig = {
  mobRadius: 0.8,
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
    attackCooldownUntil: 0,
  };
  mobs.unshift(testMob);
}

function getSpawnPoint() {
  const point = world.spawnPoints[nextSpawnIndex % world.spawnPoints.length];
  nextSpawnIndex += 1;
  return { x: point.x, z: point.z };
}

function buildState(now) {
  return {
    type: 'state',
    t: now,
    players: serializePlayers(players),
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

function killPlayer(player, now) {
  if (player.dead) return;
  player.dead = true;
  player.respawnAt = now + RESPAWN_MS;
  player.inv = 0;
  clearInventory(player.inventory);
  player.target = null;
  player.keys = { w: false, a: false, s: false, d: false };
}

function respawnPlayer(player) {
  const spawn = getSpawnPoint();
  player.pos = { x: spawn.x, y: 0, z: spawn.z };
  player.hp = player.maxHp;
  player.dead = false;
  player.respawnAt = 0;
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

  const id = `p${nextId++}`;
  const spawn = getSpawnPoint();
  const player = {
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
    score: 0,
    dead: false,
    respawnAt: 0,
  };

  players.set(id, player);
  safeSend(ws, {
    type: 'welcome',
    id,
    snapshot: {
      world: worldSnapshot(world),
      players: serializePlayers(players),
      resources: serializeResources(resources),
      mobs: serializeMobs(mobs),
    },
  });

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
      tryHarvest(resources, player, Date.now(), {
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
      return;
    }

    if (msg.type === 'inventorySwap') {
      const from = Number(msg.from);
      const to = Number(msg.to);
      if (Number.isInteger(from) && Number.isInteger(to)) {
        swapInventorySlots(player.inventory, from, to);
      }
      return;
    }
  });

  ws.on('error', () => {
    ws.terminate();
  });

  ws.on('close', () => {
    players.delete(id);
    untrackConnection(ip);
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

    const dx = player.pos.x - world.base.x;
    const dz = player.pos.z - world.base.z;
    if (player.inv > 0 && Math.hypot(dx, dz) <= world.base.radius) {
      player.score += player.inv;
      player.inv = 0;
      clearInventory(player.inventory);
    }
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
  const state = buildState(Date.now());
  for (const player of players.values()) {
    safeSend(player.ws, state);
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
