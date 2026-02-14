// @ts-check

/**
 * PvP eligibility gate. PvP damage, CC, and modifiers only apply when this returns true.
 * Currently returns false—PvP zones and PvP flags do not exist yet.
 *
 * Future activation:
 * - zone.isPvpZone: when world has zones, check if both players are in a PvP zone
 * - player.pvpFlagged: opt-in flag (e.g. duel, battleground queue)
 *
 * @param {Object} attacker - Attacking player
 * @param {Object} target - Target player (for PvP damage/CC)
 * @param {{ zone?: { isPvpZone?: boolean } }} [context] - Optional context (zone, etc.)
 * @returns {boolean}
 */
export function isPvPAllowed(attacker, target, context = {}) {
  if (!attacker || !target || attacker.id === target.id) return false;
  // Future: if (context.zone?.isPvpZone) return true;
  // Future: if (attacker.pvpFlagged && target.pvpFlagged) return true;
  return false;
}
