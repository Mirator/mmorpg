// @ts-check

export { runScenario } from './runtime/core.js';
export {
  createUniqueToken,
  moveToPoint,
  safeClick,
  signUpAndCreateCharacter,
} from './runtime/actions.js';
export { DESKTOP_VIEWPORT } from './runtime/browser.js';

export function getInventoryItems(/** @type {any} */ state) {
  return Array.isArray(state?.inventory?.items) ? state.inventory.items : [];
}

export function countInventoryKind(/** @type {any} */ state, /** @type {string} */ kind) {
  return getInventoryItems(state).reduce((/** @type {number} */ total, /** @type {any} */ item) => {
    if (!item || item.kind !== kind) return total;
    return total + Math.max(0, Math.floor(Number(item.count) || 0));
  }, 0);
}

export function getOtherVisiblePlayer(/** @type {any} */ state, /** @type {string | null} */ excludeId = null) {
  const players = Array.isArray(state?.players) ? state.players : [];
  return (
    players.find(
      (/** @type {any} */ player) =>
        player?.id &&
        player.id !== excludeId &&
        !player.dead
    ) ?? null
  );
}
