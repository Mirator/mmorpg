// @ts-check
import { resolveTarget } from './targeting.js';

/**
 * @typedef {{ inviterId: string | number, inviterName: string }} PartyInvite
 * @typedef {{ challengerId: string | number, challengerName: string }} DuelRequest
 * @typedef {{ traderId: string | number, traderName: string }} TradeRequest
 */

/**
 * @param {{
 *   ctx: any,
 *   gameState: any,
 *   ui: any,
 *   getConnection: () => any
 * }} deps
 */
export function createSocialUi({ ctx, gameState, ui, getConnection }) {
  /** @type {PartyInvite | null} */
  let pendingPartyInvite = null;
  /** @type {DuelRequest | null} */
  let pendingDuelRequest = null;
  /** @type {TradeRequest | null} */
  let pendingTradeRequest = null;

  function resolvePlayerTarget() {
    const targetId = ctx.currentMe?.targetId;
    if (!targetId || ctx.currentMe?.targetKind !== 'player') return null;
    const target = resolveTarget({ kind: 'player', id: targetId }, {
      players: gameState.getLatestPlayers(),
      mobs: {},
      vendors: [],
    });
    return {
      id: targetId,
      name: target?.name ?? 'player',
    };
  }

  /**
   * @param {string} message
   */
  function showToast(message) {
    ui.showToast?.(message);
  }

  /**
   * @param {string} elementId
   * @param {boolean} visible
   */
  function toggleHiddenById(elementId, visible) {
    const element = document.getElementById(elementId);
    if (element) {
      element.classList.toggle('hidden', !visible);
    }
  }

  function updatePartyPanel() {
    const panel = document.getElementById('party-panel');
    const toast = document.getElementById('party-invite-toast');
    const statusEl = panel?.querySelector('.party-status');
    const leaveBtn = document.getElementById('party-leave-btn');
    const inviteBtn = document.getElementById('party-invite-btn');
    const inParty = !!ctx.currentMe?.partyId;
    const hasPlayerTarget = ctx.currentMe?.targetKind === 'player' && ctx.currentMe?.targetId;
    const showPanel = inParty || !!pendingPartyInvite || hasPlayerTarget;
    if (panel) {
      panel.classList.toggle('hidden', !showPanel);
    }
    if (toast) {
      toast.classList.toggle('hidden', !pendingPartyInvite);
    }
    if (statusEl instanceof HTMLElement) {
      statusEl.style.display = inParty ? 'block' : 'none';
    }
    if (leaveBtn instanceof HTMLElement) {
      leaveBtn.style.display = inParty ? 'inline-block' : 'none';
    }
    if (inviteBtn instanceof HTMLElement) {
      inviteBtn.style.display = hasPlayerTarget ? 'inline-block' : 'none';
    }
  }

  function updatePartyHud() {
    const hud = document.getElementById('party-hud');
    if (!hud) return;
    const me = ctx.currentMe;
    const memberIds = Array.isArray(me?.partyMemberIds) ? me.partyMemberIds : [];
    const visibleMemberIds = memberIds.filter(
      (/** @type {string | number | null | undefined} */ id) => id && id !== ctx.playerId
    );
    if (!me?.partyId || visibleMemberIds.length === 0) {
      hud.classList.add('hidden');
      hud.innerHTML = '';
      return;
    }
    const players = gameState.getLatestPlayers();
    hud.classList.remove('hidden');
    hud.innerHTML = '';
    for (const memberId of visibleMemberIds.slice(0, 4)) {
      const member = players?.[memberId];
      if (!member) continue;
      const row = document.createElement('div');
      row.className = 'party-hud-row';
      const name = document.createElement('div');
      name.className = 'party-hud-name';
      name.textContent = member.name ?? 'Party Member';
      const distance = document.createElement('div');
      distance.className = 'party-hud-distance';
      const meters = Number.isFinite(me?.x) && Number.isFinite(me?.z)
        ? Math.hypot((member.x ?? 0) - me.x, (member.z ?? 0) - me.z)
        : null;
      distance.textContent = meters != null ? `${meters.toFixed(1)}m` : '--';
      const bar = document.createElement('div');
      bar.className = 'party-hud-bar';
      const fill = document.createElement('div');
      fill.className = 'party-hud-fill';
      const hp = Number.isFinite(member.hp) ? member.hp : 0;
      const maxHp = Number.isFinite(member.maxHp) && member.maxHp > 0 ? member.maxHp : Math.max(1, hp);
      fill.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
      bar.appendChild(fill);
      row.appendChild(name);
      row.appendChild(distance);
      row.appendChild(bar);
      hud.appendChild(row);
    }
  }

  function updateDuelPanel() {
    const panel = document.getElementById('duel-panel');
    const toast = document.getElementById('duel-request-toast');
    const statusEl = panel?.querySelector('.duel-status');
    const forfeitBtn = document.getElementById('duel-forfeit-btn');
    const requestBtn = document.getElementById('duel-request-btn');
    const tradeRequestBtn = document.getElementById('trade-request-btn');
    const inDuel = !!ctx.currentMe?.duelOpponentId;
    const hasPlayerTarget = ctx.currentMe?.targetKind === 'player' && ctx.currentMe?.targetId;
    const showPanel = inDuel || !!pendingDuelRequest || hasPlayerTarget;
    if (panel) {
      panel.classList.toggle('hidden', !showPanel);
    }
    if (toast) {
      toast.classList.toggle('hidden', !pendingDuelRequest);
    }
    if (statusEl instanceof HTMLElement) {
      statusEl.style.display = inDuel ? 'block' : 'none';
    }
    if (forfeitBtn instanceof HTMLElement) {
      forfeitBtn.style.display = inDuel ? 'inline-block' : 'none';
    }
    if (requestBtn instanceof HTMLElement) {
      requestBtn.style.display = hasPlayerTarget && !inDuel ? 'inline-block' : 'none';
    }
    if (tradeRequestBtn instanceof HTMLElement) {
      tradeRequestBtn.style.display = hasPlayerTarget && !inDuel ? 'inline-block' : 'none';
    }
  }

  function updateTradeRequestToast() {
    toggleHiddenById('trade-request-toast', !!pendingTradeRequest);
  }

  function updateUi() {
    updatePartyPanel();
    updatePartyHud();
    updateDuelPanel();
    updateTradeRequestToast();
  }

  function sendTargetedPlayerAction(
    /** @type {(targetId: string | number) => void} */ send,
    /** @type {string} */ messagePrefix
  ) {
    const target = resolvePlayerTarget();
    if (!target) return;
    send(target.id);
    showToast(`${messagePrefix} ${target.name}`);
  }

  function initButtons() {
    const leaveBtn = document.getElementById('party-leave-btn');
    const inviteBtn = document.getElementById('party-invite-btn');
    const partyAcceptBtn = document.getElementById('party-accept-btn');
    const partyDeclineBtn = document.getElementById('party-decline-btn');
    const forfeitBtn = document.getElementById('duel-forfeit-btn');
    const duelRequestBtn = document.getElementById('duel-request-btn');
    const duelAcceptBtn = document.getElementById('duel-accept-btn');
    const duelDeclineBtn = document.getElementById('duel-decline-btn');
    const tradeRequestBtn = document.getElementById('trade-request-btn');
    const tradeAcceptBtn = document.getElementById('trade-request-accept');
    const tradeDeclineBtn = document.getElementById('trade-request-decline');

    leaveBtn?.addEventListener('click', () => {
      getConnection()?.sendPartyLeave?.();
    });
    inviteBtn?.addEventListener('click', () => {
      sendTargetedPlayerAction(
        (/** @type {string | number} */ targetId) => getConnection()?.sendPartyInvite?.(targetId),
        'Party invite sent to'
      );
    });
    partyAcceptBtn?.addEventListener('click', () => {
      if (!pendingPartyInvite) return;
      getConnection()?.sendPartyAccept?.(pendingPartyInvite.inviterId);
      pendingPartyInvite = null;
      updateUi();
    });
    partyDeclineBtn?.addEventListener('click', () => {
      pendingPartyInvite = null;
      updateUi();
    });

    forfeitBtn?.addEventListener('click', () => {
      getConnection()?.sendDuelForfeit?.();
    });
    duelRequestBtn?.addEventListener('click', () => {
      sendTargetedPlayerAction(
        (/** @type {string | number} */ targetId) => getConnection()?.sendDuelRequest?.(targetId),
        'Duel challenge sent to'
      );
    });
    duelAcceptBtn?.addEventListener('click', () => {
      if (!pendingDuelRequest) return;
      getConnection()?.sendDuelAccept?.(pendingDuelRequest.challengerId);
      pendingDuelRequest = null;
      updateUi();
    });
    duelDeclineBtn?.addEventListener('click', () => {
      if (!pendingDuelRequest) return;
      getConnection()?.sendDuelDecline?.(pendingDuelRequest.challengerId);
      pendingDuelRequest = null;
      updateUi();
    });

    tradeRequestBtn?.addEventListener('click', () => {
      sendTargetedPlayerAction(
        (/** @type {string | number} */ targetId) => getConnection()?.sendTradeRequest?.(targetId),
        'Trade request sent to'
      );
    });
    tradeAcceptBtn?.addEventListener('click', () => {
      if (!pendingTradeRequest) return;
      getConnection()?.sendTradeAccept?.(pendingTradeRequest.traderId);
      pendingTradeRequest = null;
      updateUi();
    });
    tradeDeclineBtn?.addEventListener('click', () => {
      if (!pendingTradeRequest) return;
      getConnection()?.sendTradeDecline?.(pendingTradeRequest.traderId);
      pendingTradeRequest = null;
      updateUi();
    });
  }

  initButtons();

  return {
    updateUi,
    onPartyInvite(/** @type {PartyInvite} */ invite) {
      pendingPartyInvite = invite;
      const textEl = document.getElementById('party-invite-text');
      if (textEl) {
        textEl.textContent = `${invite.inviterName} invited you to party`;
      }
      updateUi();
    },
    onDuelRequest(/** @type {DuelRequest} */ req) {
      pendingDuelRequest = req;
      const textEl = document.getElementById('duel-request-text');
      if (textEl) {
        textEl.textContent = `${req.challengerName} challenges you to a duel`;
      }
      updateUi();
    },
    onDuelActive() {
      pendingDuelRequest = null;
      updateUi();
    },
    onDuelEnded(/** @type {string} */ reason) {
      pendingDuelRequest = null;
      updateUi();
      showToast(reason === 'forfeit' ? 'Duel forfeited' : 'Duel ended');
    },
    onTradeRequest(/** @type {TradeRequest} */ req) {
      pendingTradeRequest = req;
      const textEl = document.getElementById('trade-request-text');
      if (textEl) {
        textEl.textContent = `${req.traderName} wants to trade`;
      }
      updateUi();
    },
    onTradeOpened(/** @type {any} */ data) {
      pendingTradeRequest = null;
      ui.playerTradeUI?.setOpen?.(true);
      ui.playerTradeUI?.setPartnerName?.(data.partnerName);
      ui.playerTradeUI?.setOffers?.({
        myOffer: data.myOffer,
        theirOffer: data.theirOffer,
        confirmed: false,
        theirConfirmed: false,
      });
      ui.setInventoryOpen?.(true);
      updateUi();
    },
    onTradeOfferUpdate(/** @type {any} */ data) {
      ui.playerTradeUI?.setOffers?.(data);
    },
    onTradeCompleted() {
      ui.playerTradeUI?.close?.();
      showToast('Trade completed');
      updateUi();
    },
    onTradeCancelled() {
      ui.playerTradeUI?.close?.();
      showToast('Trade cancelled');
      updateUi();
    },
    onTradeDeclined() {
      showToast('Trade declined');
    },
    onTradeError(/** @type {unknown} */ err) {
      showToast(`Trade error: ${err ?? 'unknown'}`);
    },
  };
}
