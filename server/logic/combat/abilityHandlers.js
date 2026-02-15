/**
 * @typedef {Object} AbilityHandlerDeps
 * @property {Function} computeAbilityDamage
 * @property {Function} applyPvpDamageMultiplier
 * @property {Function} applyPvpHealMultiplier
 * @property {Function} applyDamageToMob
 * @property {Function} applyDamageToPlayer
 * @property {Function} rollHit
 * @property {Function} getMobDisplayName
 * @property {Function} applyCCWithDR
 * @property {Function} applyCleave
 * @property {Function} applyNova
 * @property {Function} clampResource
 * @property {Function} clamp
 * @property {Function} computeDerivedStats
 * @property {Function} isPvPAllowed
 * @property {Function} applyCollisions
 * @property {number} DOT_TICK_MS
 */

import { createGuardianHandlers } from './abilities/guardian.js';
import { createFighterHandlers } from './abilities/fighter.js';
import { createRangerHandlers } from './abilities/ranger.js';
import { createMageHandlers } from './abilities/mage.js';
import { createPriestHandlers } from './abilities/priest.js';

/**
 * @param {AbilityHandlerDeps} deps
 * @returns {Record<string, (ctx: object) => object>}
 */
export function createAbilityHandlers(deps) {
  return {
    ...createGuardianHandlers(deps),
    ...createFighterHandlers(deps),
    ...createRangerHandlers(deps),
    ...createMageHandlers(deps),
    ...createPriestHandlers(deps),
  };
}
