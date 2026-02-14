import http from 'http';
import { createHttpApp } from './http.js';
import { createSimulatedWorld, createWorldFromConfig } from './logic/world.js';
import { createResources } from './logic/resources.js';
import { createMobs, createMobsFromSpawns, getMobMaxHp } from './logic/mobs.js';
import { createWebSocketServer } from './ws.js';
import { createGameLoop } from './gameLoop.js';
import { createSpawner } from './spawn.js';
import { createPersistence } from './persistence.js';
import { serializePlayerState } from './db/playerState.js';
import { savePlayer } from './db/playerRepo.js';
import { disconnectPrisma } from './db/client.js';
import { getServerConfig } from './config.js';
import { seedDevAccount } from './devSeed.js';
import { autoMigrateDev } from './devMigrate.js';
import { loadMapConfigSync, resolveMapConfigPath } from './mapConfig.js';

export function createServer({ env = process.env } = {}) {
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
  const corpses = [];
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
        x: world.base.x + world.base.radius + 12,
        y: 0,
        z: world.base.z,
      },
      testId: 'm-test',
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
    const chaseMaxHp = getMobMaxHp(chaseMobLevel);
    mobs.unshift({
      id: 'm-chase',
      pos: {
        x: world.base.x - (world.base.radius + 12),
        y: 0,
        z: world.base.z,
      },
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
  });

  function getMobDisplayName(mob) {
    if (!mob) return 'Enemy';
    const level = mob.level ?? 1;
    return `Enemy (Lv.${level})`;
  }

  const onPlayerDamaged = (player, mob, damage, now) => {
    const mobName = getMobDisplayName(mob);
    ws.sendCombatLogToPlayer(player.id, [
      {
        kind: 'damage_received',
        text: `${mobName} hit you for ${damage} damage`,
        t: now,
      },
    ]);
  };

  const onCombatLog = (playerId, entries) => {
    ws.sendCombatLogToPlayer(playerId, entries);
  };

  const onCombatEvent = (event, now) => {
    ws.broadcastCombatEvent(event, now);
  };

  const onPlayerDeath = (playerId, now) => {
    ws.sendCombatLogToPlayer(playerId, [
      {
        kind: 'death',
        text: 'You died. Return to your corpse to retrieve your items.',
        t: now,
      },
    ]);
  };

  const gameLoop = createGameLoop({
    players,
    world,
    resources,
    mobs,
    corpses,
    config,
    spawner,
    markDirty: persistence.markDirty,
    onPlayerDamaged,
    onCombatLog,
    onPlayerDeath,
    onCombatEvent,
  });

  function start() {
    autoMigrateDev({ env, config });
    seedDevAccount({ env, config }).catch((err) => {
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
