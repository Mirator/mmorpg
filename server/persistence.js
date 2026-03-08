// @ts-check
import { logger } from './logger.js';

export function createPersistence(/** @type {any} */ {
  players,
  savePlayer,
  serializePlayerState,
  persistIntervalMs,
  persistForceMs,
  persistPosEps,
}) {
  function markDirty(/** @type {any} */ player) {
    if (!player || player.isGuest) return;
    player.dirty = true;
  }

  function initPlayerPersistence(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
    if (!player) return;
    player.dirty = false;
    player.lastPersistedAt = now;
    player.lastPersistedPos = { x: player.pos?.x ?? 0, z: player.pos?.z ?? 0 };
  }

  function shouldPersistPlayer(/** @type {any} */ player, /** @type {any} */ now) {
    if (!player || player.isGuest) return false;
    if (player.dirty) return true;
    const lastAt = Number(player.lastPersistedAt) || 0;
    if (now - lastAt >= persistForceMs) return true;
    const lastPos = player.lastPersistedPos;
    if (!lastPos) return true;
    const dx = (player.pos?.x ?? 0) - lastPos.x;
    const dz = (player.pos?.z ?? 0) - lastPos.z;
    return Math.hypot(dx, dz) >= persistPosEps;
  }

  async function persistPlayer(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
    if (!player || player.isGuest) return;
    const state = serializePlayerState(player);
    await savePlayer(player, state, new Date(now));
    player.dirty = false;
    player.lastPersistedAt = now;
    player.lastPersistedPos = { x: player.pos?.x ?? 0, z: player.pos?.z ?? 0 };
  }

  let /** @type {any} */ intervalId = null;
  let persistRunning = false;

  function startPersistenceLoop() {
    if (intervalId) return;
    intervalId = setInterval(() => {
      if (persistRunning) return;
      persistRunning = true;
      const now = Date.now();
      const /** @type {any} */ pending = [];
      for (const player of players.values()) {
        if (!shouldPersistPlayer(player, now)) continue;
        pending.push(
          persistPlayer(player, now).catch((/** @type {any} */ err) => {
            logger.error('Failed to persist player:', err);
            player.dirty = true;
          })
        );
      }
      Promise.allSettled(pending).finally(() => {
        persistRunning = false;
      });
    }, persistIntervalMs);
    intervalId.unref?.();
  }

  function stopPersistenceLoop() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  async function flushAll() {
    const now = Date.now();
    const /** @type {any} */ pending = [];
    for (const player of players.values()) {
      pending.push(
        persistPlayer(player, now).catch((/** @type {any} */ err) => {
          logger.error('Failed to persist player during shutdown:', err);
          player.dirty = true;
        })
      );
    }
    await Promise.allSettled(pending);
  }

  return {
    markDirty,
    initPlayerPersistence,
    shouldPersistPlayer,
    persistPlayer,
    startPersistenceLoop,
    stopPersistenceLoop,
    flushAll,
  };
}
