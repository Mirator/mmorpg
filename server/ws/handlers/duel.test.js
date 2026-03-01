import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDuelRequest,
  handleDuelAccept,
  handleDuelDecline,
  handleDuelForfeit,
} from './duel.js';

function createPlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Alice',
    persistName: 'Alice',
    dead: false,
    pos: { x: 0, y: 0, z: 0 },
    duelOpponentId: null,
    ws: { id: 'ws-1' },
    ...overrides,
  };
}

/**
 * @param {any} ctx
 */
function ctxWith(player, players, msg, overrides = {}) {
  return {
    player,
    players,
    msg,
    ws: player.ws,
    safeSend: vi.fn(),
    sendPrivateState: vi.fn(),
    persistence: { markDirty: vi.fn() },
    ...overrides,
  };
}

describe('duel handlers', () => {
  let players;
  let playerA;
  let playerB;

  beforeEach(() => {
    players = new Map();
    playerA = createPlayer({ id: 'p1', pos: { x: 0, y: 0, z: 0 } });
    playerB = createPlayer({ id: 'p2', pos: { x: 2, y: 0, z: 0 } });
    players.set(playerA.id, playerA);
    players.set(playerB.id, playerB);
  });

  describe('handleDuelRequest', () => {
    it('sends duelRequestReceived to target when in range', () => {
      const ctx = ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id });
      handleDuelRequest(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, {
        type: 'duelRequestReceived',
        challengerId: playerA.id,
        challengerName: 'Alice',
      });
    });

    it('does nothing when target is out of range', () => {
      playerB.pos = { x: 10, y: 0, z: 0 };
      const ctx = ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id });
      handleDuelRequest(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });

    it('does nothing when target is dead', () => {
      playerB.dead = true;
      const ctx = ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id });
      handleDuelRequest(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });

    it('does nothing when target already in duel', () => {
      playerB.duelOpponentId = 'other';
      const ctx = ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id });
      handleDuelRequest(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });

  describe('handleDuelAccept', () => {
    it('starts duel and sends duelActive to both', () => {
      handleDuelRequest(ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id }));
      const ctx = ctxWith(playerB, players, { type: 'duelAccept', challengerId: playerA.id });
      handleDuelAccept(ctx);
      expect(playerA.duelOpponentId).toBe(playerB.id);
      expect(playerB.duelOpponentId).toBe(playerA.id);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, {
        type: 'duelActive',
        opponentId: playerB.id,
        opponentName: 'Alice',
      });
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, {
        type: 'duelActive',
        opponentId: playerA.id,
        opponentName: 'Alice',
      });
    });

    it('does nothing when challenger is out of range', () => {
      playerA.pos = { x: 10, y: 0, z: 0 };
      const ctx = ctxWith(playerB, players, { type: 'duelAccept', challengerId: playerA.id });
      handleDuelAccept(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });

  describe('handleDuelDecline', () => {
    it('sends duelDeclined to challenger', () => {
      const ctx = ctxWith(playerB, players, { type: 'duelDecline', challengerId: playerA.id });
      handleDuelDecline(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, {
        type: 'duelDeclined',
        targetId: playerB.id,
        targetName: 'Alice',
      });
    });
  });

  describe('handleDuelForfeit', () => {
    it('ends duel and sends duelEnded to both', () => {
      handleDuelRequest(ctxWith(playerA, players, { type: 'duelRequest', targetId: playerB.id }));
      handleDuelAccept(ctxWith(playerB, players, { type: 'duelAccept', challengerId: playerA.id }));
      const ctx = ctxWith(playerA, players, { type: 'duelForfeit' });
      handleDuelForfeit(ctx);
      expect(playerA.duelOpponentId).toBeUndefined();
      expect(playerB.duelOpponentId).toBeUndefined();
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, { type: 'duelEnded', reason: 'forfeit' });
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, { type: 'duelEnded', reason: 'forfeit' });
    });

    it('does nothing when not in duel', () => {
      const ctx = ctxWith(playerA, players, { type: 'duelForfeit' });
      handleDuelForfeit(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });
});
