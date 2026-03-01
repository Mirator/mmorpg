import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleTradeRequest,
  handleTradeAccept,
  handleTradeDecline,
  handleTradeOffer,
  handleTradeConfirm,
  handleTradeCancel,
} from './trade.js';
import { endTradeSession } from '../../logic/trade.js';
import { createInventory } from '../../logic/inventory.js';

function createPlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Alice',
    persistName: 'Alice',
    dead: false,
    pos: { x: 0, y: 0, z: 0 },
    inventory: createInventory(6),
    invStackMax: 20,
    currencyCopper: 100,
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
    safeSend: vi.fn(),
    sendPrivateState: vi.fn(),
    persistence: { markDirty: vi.fn() },
    ...overrides,
  };
}

describe('trade handlers', () => {
  let players;
  let playerA;
  let playerB;

  beforeEach(() => {
    players = new Map();
    playerA = createPlayer({ id: 'p1', pos: { x: 0, y: 0, z: 0 } });
    playerB = createPlayer({ id: 'p2', pos: { x: 2, y: 0, z: 0 } });
    players.set(playerA.id, playerA);
    players.set(playerB.id, playerB);
    endTradeSession(playerA);
    endTradeSession(playerB);
  });

  describe('handleTradeRequest', () => {
    it('sends tradeRequestReceived to target when in range', () => {
      const ctx = ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id });
      handleTradeRequest(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, {
        type: 'tradeRequestReceived',
        traderId: playerA.id,
        traderName: 'Alice',
      });
    });

    it('does nothing when target is out of range', () => {
      playerB.pos = { x: 10, y: 0, z: 0 };
      const ctx = ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id });
      handleTradeRequest(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });

    it('does nothing when target is dead', () => {
      playerB.dead = true;
      const ctx = ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id });
      handleTradeRequest(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });

  describe('handleTradeAccept', () => {
    it('opens trade session and sends tradeOpened to both players', () => {
      const ctx = ctxWith(playerB, players, { type: 'tradeAccept', traderId: playerA.id });
      handleTradeRequest(ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id }));
      handleTradeAccept(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, expect.objectContaining({
        type: 'tradeOpened',
        partnerId: playerA.id,
        partnerName: 'Alice',
      }));
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, expect.objectContaining({
        type: 'tradeOpened',
        partnerId: playerB.id,
        partnerName: 'Alice',
      }));
    });

    it('does nothing when challenger is out of range', () => {
      playerA.pos = { x: 10, y: 0, z: 0 };
      const ctx = ctxWith(playerB, players, { type: 'tradeAccept', traderId: playerA.id });
      handleTradeAccept(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });

  describe('handleTradeDecline', () => {
    it('sends tradeDeclined to trader', () => {
      const ctx = ctxWith(playerB, players, { type: 'tradeDecline', traderId: playerA.id });
      handleTradeDecline(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, {
        type: 'tradeDeclined',
        targetId: playerB.id,
      });
    });
  });

  describe('handleTradeOffer', () => {
    it('sends tradeError when offer is invalid', () => {
      handleTradeRequest(ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id }));
      handleTradeAccept(ctxWith(playerB, players, { type: 'tradeAccept', traderId: playerA.id }));
      const ctx = ctxWith(playerA, players, {
        type: 'tradeOffer',
        op: 'add',
        slot: 99,
      });
      handleTradeOffer(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, expect.objectContaining({
        type: 'tradeError',
        error: expect.any(String),
      }));
    });

    it('does nothing when not in trade session', () => {
      const ctx = ctxWith(playerA, players, {
        type: 'tradeOffer',
        op: 'add',
        copper: 10,
      });
      handleTradeOffer(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });

  describe('handleTradeCancel', () => {
    it('sends tradeCancelled to both when in session', () => {
      handleTradeRequest(ctxWith(playerA, players, { type: 'tradeRequest', targetId: playerB.id }));
      handleTradeAccept(ctxWith(playerB, players, { type: 'tradeAccept', traderId: playerA.id }));
      const ctx = ctxWith(playerA, players, { type: 'tradeCancel' });
      handleTradeCancel(ctx);
      expect(ctx.safeSend).toHaveBeenCalledWith(playerA.ws, { type: 'tradeCancelled' });
      expect(ctx.safeSend).toHaveBeenCalledWith(playerB.ws, { type: 'tradeCancelled' });
    });

    it('does nothing when not in trade session', () => {
      const ctx = ctxWith(playerA, players, { type: 'tradeCancel' });
      handleTradeCancel(ctx);
      expect(ctx.safeSend).not.toHaveBeenCalled();
    });
  });
});
