// @ts-check

import { startDuel, endDuel, playersInRange } from '../../logic/duel.js';

/** @typedef {import('../../types/domain.d.ts').DuelHandlerContext} DuelHandlerContext */

/**
 * @param {DuelHandlerContext} ctx
 */
export function handleDuelRequest(ctx) {
  const { player, players, msg, safeSend, sendPrivateState, persistence } = ctx;
  const targetId = msg.targetId;
  if (typeof targetId !== 'string') return;
  const target = players.get(targetId);
  if (!target?.ws || target.dead || player.dead) return;
  if (player.duelOpponentId || target.duelOpponentId) return;
  if (!playersInRange(player, target)) return;

  safeSend(target.ws, {
    type: 'duelRequestReceived',
    challengerId: player.id,
    challengerName: player.name ?? player.persistName ?? 'Unknown',
  });
}

/**
 * @param {DuelHandlerContext} ctx
 */
export function handleDuelAccept(ctx) {
  const { player, players, msg, safeSend, sendPrivateState, persistence } = ctx;
  const challengerId = msg.challengerId;
  if (typeof challengerId !== 'string') return;
  const challenger = players.get(challengerId);
  if (!challenger?.ws || challenger.dead || player.dead) return;
  if (player.duelOpponentId || challenger.duelOpponentId) return;
  if (!playersInRange(player, challenger)) return;

  startDuel(challenger, player);
  persistence.markDirty(challenger);
  persistence.markDirty(player);

  safeSend(challenger.ws, {
    type: 'duelActive',
    opponentId: player.id,
    opponentName: player.name ?? player.persistName ?? 'Unknown',
  });
  safeSend(player.ws, {
    type: 'duelActive',
    opponentId: challenger.id,
    opponentName: challenger.name ?? challenger.persistName ?? 'Unknown',
  });
  sendPrivateState(challenger.ws, challenger, Date.now());
  sendPrivateState(player.ws, player, Date.now());
}

/**
 * @param {DuelHandlerContext} ctx
 */
export function handleDuelDecline(ctx) {
  const { player, players, msg, safeSend } = ctx;
  const challengerId = msg.challengerId;
  if (typeof challengerId !== 'string') return;
  const challenger = players.get(challengerId);
  if (challenger?.ws) {
    safeSend(challenger.ws, {
      type: 'duelDeclined',
      targetId: player.id,
      targetName: player.name ?? player.persistName ?? 'Unknown',
    });
  }
}

/**
 * @param {DuelHandlerContext} ctx
 */
export function handleDuelForfeit(ctx) {
  const { player, players, ws, safeSend, sendPrivateState, persistence } = ctx;
  const opponent = endDuel(player, players);
  if (!opponent) return;

  persistence.markDirty(player);
  persistence.markDirty(opponent);

  safeSend(ws, { type: 'duelEnded', reason: 'forfeit' });
  if (opponent?.ws) {
    safeSend(opponent.ws, { type: 'duelEnded', reason: 'forfeit' });
    sendPrivateState(opponent.ws, opponent, Date.now());
  }
  sendPrivateState(ws, player, Date.now());
}
