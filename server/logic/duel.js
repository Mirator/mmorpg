// @ts-check

const TRADE_RANGE = 5;
const TRADE_RANGE2 = TRADE_RANGE * TRADE_RANGE;

function dist2(a, b) {
  if (!a?.pos || !b?.pos) return Infinity;
  const dx = (a.pos.x ?? 0) - (b.pos.x ?? 0);
  const dz = (a.pos.z ?? 0) - (b.pos.z ?? 0);
  return dx * dx + dz * dz;
}

/**
 * Check if two players are in range for duel/trade (5m).
 * @param {Object} a - Player A
 * @param {Object} b - Player B
 * @returns {boolean}
 */
export function playersInRange(a, b) {
  return dist2(a, b) <= TRADE_RANGE2;
}

/**
 * Start a duel between two players. Sets duelOpponentId on both.
 * @param {Object} a - Player A (challenger)
 * @param {Object} b - Player B (accepter)
 */
export function startDuel(a, b) {
  if (!a || !b) return;
  a.duelOpponentId = b.id;
  b.duelOpponentId = a.id;
}

/**
 * End duel for a player and their opponent. Clears duelOpponentId on both.
 * @param {Object} player - Either duel participant
 * @param {Map<string, Object>} players - All players map
 */
export function endDuel(player, players) {
  const opponentId = player?.duelOpponentId;
  if (!opponentId) return null;
  const opponent = players?.get?.(opponentId);
  delete player.duelOpponentId;
  if (opponent) delete opponent.duelOpponentId;
  return opponent;
}
