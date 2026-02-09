import http from 'http';
import { createHttpApp } from './http.js';
import { createWorld } from './logic/world.js';
import { createResources } from './logic/resources.js';
import { createMobs, getMobMaxHp } from './logic/mobs.js';
import { createWebSocketServer } from './ws.js';
import { createGameLoop } from './gameLoop.js';
import { createSpawner } from './spawn.js';
import { createPersistence } from './persistence.js';
import { serializePlayerState } from './db/playerState.js';
import { savePlayer } from './db/playerRepo.js';
import { disconnectPrisma } from './db/client.js';
import { getServerConfig } from './config.js';

export function createServer({ env = process.env } = {}) {
  const config = getServerConfig(env);
  const isE2eTest = env.E2E_TEST === 'true';
  const world = createWorld();
  const resources = createResources(world.resourceNodes);
  const mobs = createMobs(world.mobCount, world);
  const players = new Map();
  const spawner = createSpawner(world);

  if (isE2eTest) {
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
    mobs.unshift({
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
    });
  }

  const app = createHttpApp({ config, world, players, resources, mobs });
  const server = http.createServer(app);

  const persistence = createPersistence({
    players,
    savePlayer,
    serializePlayerState,
    persistIntervalMs: config.persistIntervalMs,
    persistForceMs: config.persistForceMs,
    persistPosEps: config.persistPosEps,
  });

  const ws = createWebSocketServer({
    server,
    config,
    world,
    resources,
    mobs,
    players,
    spawner,
    persistence,
  });

  const gameLoop = createGameLoop({
    players,
    world,
    resources,
    mobs,
    config,
    spawner,
    markDirty: persistence.markDirty,
  });

  function start() {
    ws.startHeartbeat();
    ws.startBroadcast();
    persistence.startPersistenceLoop();
    gameLoop.start();
  }

  async function stop() {
    ws.stopBroadcast();
    ws.stopHeartbeat();
    persistence.stopPersistenceLoop();
    gameLoop.stop();
    ws.closeAll();
    await persistence.flushAll();
    await disconnectPrisma();
  }

  return {
    app,
    server,
    config,
    world,
    resources,
    mobs,
    players,
    start,
    stop,
  };
}
