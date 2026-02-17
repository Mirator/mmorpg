// @ts-check

import { playersInRange } from '../../logic/duel.js';
import {
  createTradeSession,
  getTradeSession,
  getTradePartner,
  getMyOffer,
  getOtherOffer,
  addItemToOffer,
  addCopperToOffer,
  removeItemFromOffer,
  removeCopperFromOffer,
  executeTrade,
  endTradeSession,
  isTrading,
} from '../../logic/trade.js';

/** @typedef {import('../../types/domain.d.ts').TradeHandlerContext} TradeHandlerContext */
/** @typedef {import('../../types/domain.d.ts').TradeOffer} TradeOffer */

/**
 * @param {TradeOffer} offer
 * @returns {TradeOffer}
 */
function serializeOffer(offer) {
  return {
    items: offer.items.map((item) => (item ? { ...item } : null)),
    copper: offer.copper ?? 0,
  };
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeRequest(ctx) {
  const { player, players, msg, safeSend } = ctx;
  const targetId = msg.targetId;
  if (typeof targetId !== 'string') return;
  const target = players.get(targetId);
  if (!target?.ws || target.dead || player.dead) return;
  if (isTrading(player) || isTrading(target)) return;
  if (!playersInRange(player, target)) return;

  safeSend(target.ws, {
    type: 'tradeRequestReceived',
    traderId: player.id,
    traderName: player.name ?? player.persistName ?? 'Unknown',
  });
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeAccept(ctx) {
  const { player, players, msg, safeSend, sendPrivateState, persistence } = ctx;
  const traderId = msg.traderId;
  if (typeof traderId !== 'string') return;
  const trader = players.get(traderId);
  if (!trader?.ws || trader.dead || player.dead) return;
  if (isTrading(player) || isTrading(trader)) return;
  if (!playersInRange(player, trader)) return;

  const session = createTradeSession(trader, player, players);
  if (!session) return;

  persistence.markDirty(player);
  persistence.markDirty(trader);

  const payload = {
    type: 'tradeOpened',
    partnerId: trader.id,
    partnerName: trader.name ?? trader.persistName ?? 'Unknown',
    myOffer: serializeOffer(getMyOffer(player)),
    theirOffer: serializeOffer(getOtherOffer(player)),
    confirmed: false,
    theirConfirmed: false,
  };

  const payloadTrader = {
    type: 'tradeOpened',
    partnerId: player.id,
    partnerName: player.name ?? player.persistName ?? 'Unknown',
    myOffer: serializeOffer(getMyOffer(trader)),
    theirOffer: serializeOffer(getOtherOffer(trader)),
    confirmed: false,
    theirConfirmed: false,
  };

  safeSend(player.ws, payload);
  safeSend(trader.ws, payloadTrader);
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeDecline(ctx) {
  const { player, players, msg, safeSend } = ctx;
  const traderId = msg.traderId;
  if (typeof traderId !== 'string') return;
  const trader = players.get(traderId);
  if (trader?.ws) {
    safeSend(trader.ws, { type: 'tradeDeclined', targetId: player.id });
  }
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeOffer(ctx) {
  const { player, players, msg, safeSend, sendPrivateState, persistence } = ctx;
  const session = getTradeSession(player.id);
  if (!session) return;
  const partner = getTradePartner(player);
  if (!partner?.ws) return;

  let updated = false;
  let /** @type {string | undefined} */ error;

  if (msg.op === 'add') {
    if (msg.slot !== undefined) {
      const r = addItemToOffer(player, msg.slot);
      if (r.ok) updated = true;
      else error = r.error;
    } else if (msg.copper !== undefined) {
      const r = addCopperToOffer(player, msg.copper);
      if (r.ok) updated = true;
      else error = r.error;
    }
  } else if (msg.op === 'remove') {
    if (msg.slot !== undefined) {
      const r = removeItemFromOffer(player, msg.slot);
      if (r.ok) updated = true;
      else error = r.error;
    } else if (msg.copper) {
      removeCopperFromOffer(player);
      updated = true;
    }
  }

  if (error !== undefined) {
    safeSend(player.ws, { type: 'tradeError', error });
    return;
  }
  if (updated) {
    persistence.markDirty(player);
    const myOffer = serializeOffer(getMyOffer(player));
    const theirOffer = serializeOffer(getOtherOffer(player));
    safeSend(player.ws, { type: 'tradeOfferUpdate', myOffer, theirOffer });
    safeSend(partner.ws, {
      type: 'tradeOfferUpdate',
      myOffer: serializeOffer(getMyOffer(partner)),
      theirOffer: serializeOffer(getOtherOffer(partner)),
    });
  }
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeConfirm(ctx) {
  const { player, safeSend, sendPrivateState, persistence } = ctx;
  const session = getTradeSession(player.id);
  if (!session) return;
  const partner = getTradePartner(player);
  if (!partner?.ws) return;

  if (session.a.id === player.id) {
    session.confirmedA = true;
  } else {
    session.confirmedB = true;
  }
  persistence.markDirty(player);

  const myOffer = serializeOffer(getMyOffer(player));
  const theirOffer = serializeOffer(getOtherOffer(player));
  const theirConfirmed = session.a.id === player.id ? session.confirmedB : session.confirmedA;

  safeSend(player.ws, { type: 'tradeOfferUpdate', myOffer, theirOffer, confirmed: true, theirConfirmed });
  safeSend(partner.ws, {
    type: 'tradeOfferUpdate',
    myOffer: serializeOffer(getMyOffer(partner)),
    theirOffer: serializeOffer(getOtherOffer(partner)),
    confirmed: session.a.id === partner.id ? session.confirmedA : session.confirmedB,
    theirConfirmed: true,
  });

  if (session.confirmedA && session.confirmedB) {
    const result = executeTrade(session, persistence.markDirty.bind(persistence));
    endTradeSession(player, false);
    if (result.ok) {
      safeSend(player.ws, { type: 'tradeCompleted' });
      safeSend(partner.ws, { type: 'tradeCompleted' });
      sendPrivateState(player.ws, player, Date.now());
      sendPrivateState(partner.ws, partner, Date.now());
    } else {
      safeSend(player.ws, { type: 'tradeError', error: result.error });
      safeSend(partner.ws, { type: 'tradeError', error: result.error });
    }
  }
}

/**
 * @param {TradeHandlerContext} ctx
 */
export function handleTradeCancel(ctx) {
  const { player, safeSend, sendPrivateState, persistence } = ctx;
  const partner = getTradePartner(player);
  if (!partner) return;

  endTradeSession(player, true);
  persistence.markDirty(player);
  if (partner) persistence.markDirty(partner);

  safeSend(player.ws, { type: 'tradeCancelled' });
  if (partner?.ws) {
    safeSend(partner.ws, { type: 'tradeCancelled' });
    sendPrivateState(partner.ws, partner, Date.now());
  }
  sendPrivateState(player.ws, player, Date.now());
}
