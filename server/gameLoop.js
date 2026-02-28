// @ts-check
import { setLootContext } from './logic/combat.js';
import {
  buildGameLoopRuntime,
  stepPlayerActionPhase,
  stepPlayerMovementPhase,
  stepWorldSystemsPhase,
} from './gameLoopPhases.js';

export function createGameLoop(/** @type {any} */ { players, world, resources, mobs, corpses, config, spawner, nextItemIdRef, markDirty, onPlayerDamaged, onCombatLog, onPlayerDeath, onCombatEvent, onDuelEnded }) {
  const runtime = buildGameLoopRuntime(config, onPlayerDamaged);

  let /** @type {any} */ timeoutId = null;
  let nextTickAt = 0;

  function scheduleNextTick() {
    nextTickAt += runtime.dtMs;
    const delay = Math.max(0, nextTickAt - Date.now());
    timeoutId = setTimeout(tick, delay);
  }

  function tick() {
    const now = Date.now();
    setLootContext(nextItemIdRef ? { nextItemIdRef } : null);

    stepPlayerMovementPhase({
      players,
      world,
      spawner,
      now,
      runtime,
      markDirty,
    });

    const playerList = Array.from(players.values());

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
