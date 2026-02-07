import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { stepPlayer } from './server/logic/movement.js';

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const players = new Map();
let nextId = 1;

const TICK_HZ = 20;
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
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
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

wss.on('connection', (ws) => {
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
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (typeof msg !== 'object' || msg === null) return;

    if (typeof msg.seq === 'number' && msg.seq <= player.lastInputSeq) {
      return;
    }

    if (typeof msg.seq === 'number') {
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

  ws.on('close', () => {
    players.delete(id);
  });
});

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
