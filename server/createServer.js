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
import { resolveDesignerStatePath } from './mapDesignerState.js';
import { applyCollisions } from './logic/collision.js';

export function createServer(/** @type {any} */ { env = process.env } = {}) {
  const config = getServerConfig(env);
  const isE2eTest = env.E2E_TEST === 'true';
  const useSimulatedWorld =
    isE2eTest && env.E2E_SIMULATED_WORLD === 'true';
  const mapConfigPath = resolveMapConfigPath(env);
  const designerStatePath = resolveDesignerStatePath(env);
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
  let worldVersion = 1;
  let /** @type {any} */ persistence = null;
  let /** @type {any} */ ws = null;

  function replaceArrayContents(/** @type {any[]} */ target, /** @type {any[]} */ next) {
    target.splice(0, target.length, ...next);
  }

  function clampPlayersIntoWorld() {
    const runtimeWorld = /** @type {any} */ (world);
    const half = Number.isFinite(runtimeWorld?.mapSize) ? runtimeWorld.mapSize / 2 : 200;
    const playerRadius = Number.isFinite(config?.playerRadius) ? config.playerRadius : 0.45;
    for (const player of players.values()) {
      if (!player?.pos) continue;
      let y = Number.isFinite(player.pos.y) ? player.pos.y : 0;
      if (Number.isFinite(runtimeWorld?.mapYMin) && Number.isFinite(runtimeWorld?.mapYMax)) {
        y = Math.max(runtimeWorld.mapYMin, Math.min(runtimeWorld.mapYMax, y));
      }
      const clamped = {
        x: Math.max(-half, Math.min(half, Number(player.pos.x) || 0)),
        y,
        z: Math.max(-half, Math.min(half, Number(player.pos.z) || 0)),
      };
      player.pos = applyCollisions(clamped, world, playerRadius);
      player.target = null;
      if (persistence) {
        persistence.markDirty(player);
      }
    }
  }

  async function applyLiveMapConfig(/** @type {any} */ nextMapConfig = null) {
    if (useSimulatedWorld) {
      return { liveApplied: false, worldVersion };
    }
    const liveMapConfig = nextMapConfig ?? loadMapConfigSync(mapConfigPath);
    const nextWorld = createWorldFromConfig(liveMapConfig);
    const runtimeWorld = /** @type {Record<string, any>} */ (world);
    const nextWorldRecord = /** @type {Record<string, any>} */ (nextWorld);
    for (const key of Object.keys(runtimeWorld)) {
      if (!Object.prototype.hasOwnProperty.call(nextWorld, key)) {
        delete runtimeWorld[key];
      }
    }
    Object.assign(runtimeWorld, nextWorldRecord);
    replaceArrayContents(resources, createResources(world.resourceNodes));
    replaceArrayContents(mobs, createMobsFromSpawns(world.mobSpawns, world));
    clampPlayersIntoWorld();
    worldVersion += 1;
    ws?.broadcastWorldRefresh?.(Date.now());
    return {
      liveApplied: true,
      worldVersion,
    };
  }

  if (isE2eTest) {
    // Remove ambient map mobs for deterministic E2E runs.
    mobs.length = 0;

    const /** @type {any} */ testResource = {
      id: 'r-test',
      x: world.base.x + world.base.radius + 11,
      z: world.base.z + 8,
    };
    resources.unshift({
      id: testResource.id,
      x: testResource.x,
      z: testResource.z,
      available: true,
      respawnAt: 0,
    });
    const testMobLevel = 1;
    // Keep the dedicated kill target low-HP to avoid long/flaky combat loops.
    const testMobMaxHp = 12;
    const /** @type {any} */ mTestPos = {
      // Keep the dedicated combat test mob outside r-test harvest aggro range.
      x: world.base.x + world.base.radius + 20,
      y: 0,
      z: world.base.z + 12,
    };
    mobs.unshift({
      id: 'm-test',
      pos: { ...mTestPos },
      spawnPos: mTestPos,
      mobType: 'orc',
      aggressive: false,
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
      // Keep the damage-test mob on the east side so moveTo can reach it reliably
      // from the combat section without crossing fence collisions through the village.
      x: world.base.x + world.base.radius + 36,
      y: 0,
      z: world.base.z + 12,
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
    designerStatePath,
    onApplyMapConfig: applyLiveMapConfig,
  });
  const server = http.createServer(app);

  persistence = createPersistence({
    players,
    savePlayer,
    serializePlayerState,
    persistIntervalMs: config.persistIntervalMs,
    persistForceMs: config.persistForceMs,
    persistPosEps: config.persistPosEps,
  });

  ws = createWebSocketServer({
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
    const from = mob?.pos
      ? { x: mob.pos.x, y: mob.pos.y ?? 0, z: mob.pos.z }
      : Number.isFinite(mob?.x) && Number.isFinite(mob?.z)
        ? { x: mob.x, y: Number.isFinite(mob?.y) ? mob.y : 0, z: mob.z }
        : null;
    const to = player?.pos
      ? { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z }
      : null;
    const /** @type {any} */ impacts = [];
    if (Number.isFinite(damage) && damage > 0 && to) {
      impacts.push({
        kind: 'damage',
        amount: Math.floor(damage),
        targetId: String(player.id),
        targetKind: 'player',
        x: to.x,
        y: to.y ?? 0,
        z: to.z,
      });
    }
    ws.broadcastCombatEvent(
      {
        kind: 'basic_attack',
        attackType: 'melee',
        attackerId: mob?.id ?? null,
        targetId: player?.id ?? null,
        from: from ?? to,
        to,
        hit: Number.isFinite(damage) && damage > 0,
        durationMs: 180,
        ...(impacts.length ? { impacts } : {}),
      },
      now
    );
  };

  const onMobAttackTelegraph = (/** @type {any} */ player, /** @type {any} */ mob, /** @type {any} */ durationMs, /** @type {any} */ now) => {
    const center = mob?.pos
      ? { x: mob.pos.x, y: mob.pos.y ?? 0, z: mob.pos.z }
      : Number.isFinite(mob?.x) && Number.isFinite(mob?.z)
        ? { x: mob.x, y: Number.isFinite(mob?.y) ? mob.y : 0, z: mob.z }
        : null;
    if (!center) return;
    ws?.broadcastCombatEvent?.(
      {
        event: 'mobAttackTelegraph',
        mobId: mob?.id ?? null,
        targetId: player?.id ?? null,
        center,
        startAt: now,
        durationMs: Math.max(1, Math.floor(durationMs) || 450),
      },
      now
    );
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
    onMobAttackTelegraph,
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
