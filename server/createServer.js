// @ts-check
import http from 'http';
import { createHttpApp } from './http.js';
import { createSimulatedWorld, createWorldFromConfig } from './logic/world.js';
import { createResources } from './logic/resources.js';
import { createMobs, createMobsFromSpawns, getMobMaxHp } from './logic/mobs.js';
import { createWebSocketServer } from './ws.js';
import { createGameLoop } from './gameLoop.js';
import { createSpawner } from './spawn.js';
import { createPersistence } from './persistence.js';
import { getMobDisplayName } from '../shared/entityTypes.js';
import { serializePlayerState } from './db/playerState.js';
import { savePlayer } from './db/playerRepo.js';
import { disconnectPrisma } from './db/client.js';
import { getServerConfig } from './config.js';
import { seedDevAccount } from './devSeed.js';
import { autoMigrateDev } from './devMigrate.js';
import { loadMapConfigSync, resolveMapConfigPath } from './mapConfig.js';

export function createServer(/** @type {any} */ { env = process.env } = {}) {
  const config = getServerConfig(env);
  const isE2eTest = env.E2E_TEST === 'true';
  const useSimulatedWorld =
    isE2eTest && env.E2E_SIMULATED_WORLD !== 'false';
  const mapConfigPath = resolveMapConfigPath(env);
  const mapConfig = useSimulatedWorld ? null : loadMapConfigSync(mapConfigPath);
  const world = useSimulatedWorld
    ? createSimulatedWorld()
    : createWorldFromConfig(mapConfig);
  const resources = createResources(world.resourceNodes);
  const mobCount = isE2eTest && useSimulatedWorld ? 0 : world.mobCount;
  const mobs = useSimulatedWorld
    ? createMobs(mobCount, world)
    : createMobsFromSpawns(world.mobSpawns, world);
  const players = new Map();
  const /** @type {any} */ corpses = [];
  const spawner = createSpawner(world);
  const /** @type {any} */ nextItemIdRef = { current: 1 };

  if (isE2eTest) {
    const /** @type {any} */ testResource = {
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
    const testMobMaxHp = getMobMaxHp(testMobLevel, 'orc');
    const /** @type {any} */ mTestPos = {
      x: world.base.x + world.base.radius + 12,
      y: 0,
      z: world.base.z,
    };
    mobs.unshift({
      id: 'm-test',
      pos: { ...mTestPos },
      spawnPos: mTestPos,
      mobType: 'orc',
      aggressive: true,
      state: 'idle',
      targetId: null,
      nextDecisionAt: Number.MAX_SAFE_INTEGER,
      dir: { x: 0, z: 0 },
      attackCooldownUntil: 0,
      level: testMobLevel,
      hp: testMobMaxHp,
      maxHp: testMobMaxHp,
      dead: false,
      respawnAt: 0,
    });

    const chaseMobLevel = 2;
    const chaseMaxHp = getMobMaxHp(chaseMobLevel, 'orc');
    const /** @type {any} */ mChasePos = {
      x: world.base.x - (world.base.radius + 12),
      y: 0,
      z: world.base.z,
    };
    mobs.unshift({
      id: 'm-chase',
      pos: { ...mChasePos },
      spawnPos: mChasePos,
      mobType: 'orc',
      aggressive: true,
      state: 'idle',
      targetId: null,
      nextDecisionAt: Number.MAX_SAFE_INTEGER,
      dir: { x: 1, z: 0 },
      attackCooldownUntil: 0,
      level: chaseMobLevel,
      hp: chaseMaxHp,
      maxHp: chaseMaxHp,
      dead: false,
      respawnAt: 0,
    });
  }

  const app = createHttpApp({
    config,
    world,
    players,
    resources,
    mobs,
    spawner,
    mapConfigPath,
  });
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
    corpses,
    players,
    spawner,
    persistence,
    nextItemIdRef,
  });

  const onPlayerDamaged = (/** @type {any} */ player, /** @type {any} */ mob, /** @type {any} */ damage, /** @type {any} */ now) => {
    const mobName = getMobDisplayName(mob?.mobType);
    ws.sendCombatLogToPlayer(player.id, [
      {
        kind: 'damage_received',
        text: `${mobName} hit you for ${damage} damage`,
        t: now,
      },
    ]);
  };

  const onCombatLog = (/** @type {any} */ playerId, /** @type {any} */ entries) => {
    ws.sendCombatLogToPlayer(playerId, entries);
  };

  const onCombatEvent = (/** @type {any} */ event, /** @type {any} */ now) => {
    ws.broadcastCombatEvent(event, now);
  };

  const onPlayerDeath = (/** @type {any} */ playerId, /** @type {any} */ now) => {
    ws.sendCombatLogToPlayer(playerId, [
      {
        kind: 'death',
        text: 'You died. Return to your corpse to retrieve your items.',
        t: now,
      },
    ]);
  };

  const onDuelEnded = (/** @type {any} */ player, /** @type {any} */ opponent, /** @type {any} */ reason, /** @type {any} */ markDirty) => {
    if (opponent) markDirty(opponent);
    ws.notifyDuelEnded(player, opponent, reason);
  };

  const gameLoop = createGameLoop({
    players,
    world,
    resources,
    mobs,
    corpses,
    config,
    spawner,
    nextItemIdRef,
    markDirty: persistence.markDirty,
    onPlayerDamaged,
    onCombatLog,
    onPlayerDeath,
    onCombatEvent,
    onDuelEnded,
  });

  function start() {
    autoMigrateDev({ env, config });
    seedDevAccount({ env, config }).catch((/** @type {any} */ err) => {
      console.warn('[dev] Failed to seed default account:', err);
    });
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
