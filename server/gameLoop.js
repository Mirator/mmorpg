// @ts-check
import { setLootContext } from './logic/combat.js';
import {
  buildGameLoopRuntime,
  stepPlayerActionPhase,
  stepPlayerMovementPhase,
  stepWorldSystemsPhase,
} from './gameLoopPhases.js';

const ENABLE_PROFILING = process.env.DEBUG_GAME_LOOP === 'true';

export function createGameLoop(/** @type {any} */ { players, world, resources, mobs, corpses, config, spawner, nextItemIdRef, markDirty, onPlayerDamaged, onMobAttackTelegraph, onCombatLog, onPlayerDeath, onCombatEvent, onDuelEnded }) {
  const runtime = buildGameLoopRuntime(config, onPlayerDamaged, onMobAttackTelegraph);

  /** @type {any[]} */
  const playerListBuffer = [];

  let tickCount = 0;

  let /** @type {any} */ timeoutId = null;
  let nextTickAt = 0;

  function scheduleNextTick() {
    nextTickAt += runtime.dtMs;
    const delay = Math.max(0, nextTickAt - Date.now());
    timeoutId = setTimeout(tick, delay);
  }

  function tick() {
    const profilingEnabled = ENABLE_PROFILING;
    const tickStart = profilingEnabled ? Date.now() : 0;
    let movementStart = 0;
    let movementEnd = 0;
    let worldStart = 0;
    let worldEnd = 0;
    let actionStart = 0;
    let actionEnd = 0;

    const now = Date.now();
    setLootContext(nextItemIdRef ? { nextItemIdRef } : null);

    if (profilingEnabled) {
      movementStart = Date.now();
    }

    stepPlayerMovementPhase({
      players,
      world,
      spawner,
      now,
      runtime,
      markDirty,
    });

    if (profilingEnabled) {
      movementEnd = Date.now();
      worldStart = movementEnd;
    }

    playerListBuffer.length = 0;
    for (const player of players.values()) {
      playerListBuffer.push(player);
    }
    const playerList = playerListBuffer;

    stepWorldSystemsPhase({
      players,
      playerList,
      world,
      resources,
      mobs,
      corpses,
      now,
      runtime,
    });

    if (profilingEnabled) {
      worldEnd = Date.now();
      actionStart = worldEnd;
    }

    stepPlayerActionPhase({
      players,
      resources,
      mobs,
      corpses,
      now,
      runtime,
      markDirty,
      onCombatLog,
      onCombatEvent,
      onPlayerDeath,
      onDuelEnded,
    });

    if (profilingEnabled) {
      actionEnd = Date.now();
      tickCount += 1;
      if (tickCount % 100 === 0) {
        const total = actionEnd - tickStart;
        const movementMs = movementEnd - movementStart;
        const worldMs = worldEnd - worldStart;
        const actionMs = actionEnd - actionStart;
        // eslint-disable-next-line no-console
        console.log('[gameLoop] tick profiling (ms)', {
          total,
          movementMs,
          worldMs,
          actionMs,
        });
      }
    }

    scheduleNextTick();
  }

  function start() {
    if (timeoutId) return;
    nextTickAt = Date.now();
    scheduleNextTick();
  }

  function stop() {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  return { start, stop };
}
