import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { stepPlayer } from './logic/movement.js';

const app = express();
app.disable('x-powered-by');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');

const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3000;
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

const TICK_HZ = 60;
const DT = 1 / TICK_HZ;
const CONFIG = { speed: 3, targetEpsilon: 0.1 };

function snapshotPlayers() {
  const out = {};
  for (const [id, p] of players.entries()) {
    out[id] = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
  }
  return out;
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
  const player = {
    id,
    ws,
    pos: { x: 0, y: 0, z: 0 },
    target: null,
    keys: { w: false, a: false, s: false, d: false },
    lastInputSeq: 0,
  };

  players.set(id, player);
  safeSend(ws, { type: 'welcome', id, snapshot: { players: snapshotPlayers() } });

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
  for (const player of players.values()) {
    const result = stepPlayer(
      { pos: player.pos, target: player.target },
      { keys: player.keys },
      DT,
      CONFIG
    );
    player.pos = result.pos;
    player.target = result.target;
  }

  const state = {
    type: 'state',
    t: Date.now(),
    players: snapshotPlayers(),
  };

  for (const player of players.values()) {
    safeSend(player.ws, state);
  }
}, DT * 1000);

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
