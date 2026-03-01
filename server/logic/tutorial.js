// @ts-check

import { addXp } from '../../shared/progression.js';
import { getItemDisplayName } from '../../shared/economy.js';
import {
  createTutorialState,
  getNextTutorialStepId,
  isTutorialStepId,
  normalizeTutorialState,
} from '../../shared/tutorial.js';
import { addItem } from './inventory.js';

const TUTORIAL_REWARD_XP = 100;
const TUTORIAL_REWARD_COPPER = 50;
const TUTORIAL_REWARD_ITEM_KIND = 'consumable_minor_health_potion';
const TUTORIAL_REWARD_ITEM_COUNT = 2;

/**
 * @param {any} player
 */
export function ensureTutorialState(player) {
  if (!player) return createTutorialState();
  player.tutorial = normalizeTutorialState(player.tutorial);
  return player.tutorial;
}

/**
 * @param {any} player
 * @param {number} now
 * @param {{ current: number }} nextItemIdRef
 */
function grantTutorialCompletionReward(player, now, nextItemIdRef) {
  if (!player) return;
  const xpResult = addXp(
    { level: player.level ?? 1, xp: player.xp ?? 0 },
    TUTORIAL_REWARD_XP
  );
  player.level = xpResult.level;
  player.xp = xpResult.xp;
  player.currencyCopper = (player.currencyCopper ?? 0) + TUTORIAL_REWARD_COPPER;
  const stackMax = Math.max(1, Number(player.invStackMax) || 1);
  addItem(
    player.inventory,
    {
      id: `i${nextItemIdRef.current++}`,
      kind: TUTORIAL_REWARD_ITEM_KIND,
      name: getItemDisplayName(TUTORIAL_REWARD_ITEM_KIND),
      count: TUTORIAL_REWARD_ITEM_COUNT,
      isStarter: true,
    },
    stackMax
  );
  player.inv = Array.isArray(player.inventory)
    ? player.inventory.reduce(
        (/** @type {number} */ sum, /** @type {any} */ item) =>
          sum + (item ? Math.max(0, Math.floor(Number(item.count) || 0)) : 0),
        0
      )
    : player.inv ?? 0;
  player.tutorial.completed = true;
  player.tutorial.activeStepId = null;
  player.tutorial.completedAt = now;
}

/**
 * @param {any} player
 * @param {string} stepId
 * @param {{ nextItemIdRef?: { current: number }, now?: number }} [options]
 */
export function applyTutorialProgress(player, stepId, options = {}) {
  if (!player || !isTutorialStepId(stepId)) return { changed: false, rewarded: false };
  const tutorial = ensureTutorialState(player);
  if (tutorial.completed || tutorial.activeStepId !== stepId) {
    return { changed: false, rewarded: false };
  }
  if (!tutorial.completedStepIds.includes(stepId)) {
    tutorial.completedStepIds.push(stepId);
  }
  const nextStepId = getNextTutorialStepId(stepId);
  if (nextStepId) {
    tutorial.activeStepId = nextStepId;
    return { changed: true, rewarded: false };
  }
  const now = Number.isFinite(options.now) ? Math.floor(Number(options.now)) : Date.now();
  const nextItemIdRef = options.nextItemIdRef ?? { current: 1 };
  grantTutorialCompletionReward(player, now, nextItemIdRef);
  return { changed: true, rewarded: true };
}
