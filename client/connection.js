// @ts-check
import { createNet } from './net.js';
import { showErrorOverlay, hideErrorOverlay, updateErrorOverlayMessage } from './error-overlay.js';

/**
 * @typedef {{ id?: string }} CharacterRef
 * @typedef {{ character?: CharacterRef | null, guest?: boolean, ticket?: string | null }} WsUrlParams
 * @typedef {{
 *   manualStepping?: boolean;
 *   virtualNow?: number;
 *   minDelayMs?: number;
 *   maxDelayMs?: number;
 *   maxAttempts?: number;
 * }} ReconnectOptions
 * @typedef {{ manualStepping?: boolean, virtualNow?: number }} StartOptions
 * @typedef {{ character?: CharacterRef | null, guest?: boolean }} StartParams
 */

/**
 * @param {WsUrlParams} params
 */
function buildWsUrl({ character, guest, ticket }) {
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = new URL(`${wsProtocol}://${location.host}`);
  if (guest) {
    wsUrl.searchParams.set('guest', '1');
  } else if (character?.id) {
    wsUrl.searchParams.set('characterId', character.id);
    if (ticket) {
      wsUrl.searchParams.set('ticket', ticket);
    }
  }
  return wsUrl.toString();
}

async function fetchWsTicket(/** @type {any} */ characterId) {
  const res = await fetch('/api/ws-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ characterId }),
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to get connection ticket');
  }
  const data = await res.json();
  return data.ticket ?? null;
}

export function createConnection(/** @type {any} */ {
  gameState,
  renderSystem,
  ui,
  ctx,
  onCombatEvents,
  onAbilityFailed,
  onChatMessage,
  onCombatLog,
  onConnected,
  onPartyInvite,
  onDuelRequest,
  onDuelActive,
  onDuelEnded,
  onDuelDeclined,
  onTradeRequest,
  onTradeOpened,
  onTradeOfferUpdate,
  onTradeCompleted,
  onTradeCancelled,
  onTradeDeclined,
  onTradeError,
  updateLocalUi,
  setWorld,
  loadCharacters,
  clearSessionState,
  menu,
  getReconnectParams,
}) {
  let /** @type {any} */ pingIntervalId = null;

  function resetClientState() {
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
    ctx.pingMs = null;
    gameState.reset();
    renderSystem.syncPlayers([]);
    renderSystem.setLocalPlayerId(null);
    ctx.currentMe = null;
    ctx.playerId = null;
    ui.updateLocalUi({ me: null, worldConfig: null, serverNow: Date.now() });
  }

  function sendWithSeq(/** @type {any} */ msg) {
    ctx.seq += 1;
    const /** @type {any} */ payload = { ...msg, seq: ctx.seq };
    ctx.net?.send?.(payload);
  }

  function handleStateMessage(/** @type {any} */ msg, /** @type {any} */ now) {
    if (Number.isFinite(msg.t)) {
      gameState.updateServerTime(msg.t);
    }
    if (msg.world) {
      const currentWorld = gameState.getWorldConfig();
      if (!currentWorld || currentWorld.mapSize !== msg.world.mapSize) {
        setWorld(msg.world);
      }
    }
    const isFull = msg.full === true;
    const removedPlayers = msg.removedPlayers ?? [];
    const removedResources = msg.removedResources ?? [];
    const removedMobs = msg.removedMobs ?? [];
    const removedCorpses = msg.removedCorpses ?? [];

    if (msg.players != null || removedPlayers.length > 0) {
      if (isFull && msg.players) {
        gameState.pushSnapshot(msg.players, now);
      } else {
        gameState.mergePlayers(msg.players ?? {}, removedPlayers);
        gameState.pushSnapshot(gameState.getLatestPlayers(), now);
      }
      renderSystem.syncPlayers(Object.keys(gameState.getLatestPlayers()));
      updateLocalUi();
    }
    if (msg.resources != null || removedResources.length > 0) {
      if (isFull && msg.resources) {
        gameState.updateResources(msg.resources);
      } else {
        gameState.mergeResources(msg.resources ?? [], removedResources);
      }
      renderSystem.updateWorldResources(gameState.getLatestResources());
    }
    if (msg.mobs != null || removedMobs.length > 0) {
      if (isFull && msg.mobs) {
        gameState.updateMobs(msg.mobs);
      } else {
        gameState.mergeMobs(msg.mobs ?? [], removedMobs);
      }
      gameState.pushMobSnapshot(gameState.getLatestMobs(), now);
    }
    if (msg.corpses != null || removedCorpses.length > 0) {
      if (isFull && msg.corpses) {
        gameState.updateCorpses(msg.corpses);
      } else {
        gameState.mergeCorpses(msg.corpses ?? [], removedCorpses);
      }
      renderSystem.updateWorldCorpses(gameState.getLatestCorpses());
    }
  }

  function disconnect() {
    if (ctx.net) {
      ctx.closingNet = ctx.net;
      ctx.net.close();
      ctx.net = null;
    }
    resetClientState();
  }

  async function reconnectWithBackoff(
    /** @type {any} */ params,
    /** @type {ReconnectOptions} */ { manualStepping, virtualNow, minDelayMs = 1000, maxDelayMs = 30_000, maxAttempts = 10 } = {}
  ) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delayMs = attempt === 1 ? 0 : Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt - 2));
      if (delayMs > 0) {
        updateErrorOverlayMessage(
          `Retrying in ${Math.ceil(delayMs / 1000)}s… (attempt ${attempt}/${maxAttempts})`
        );
        await new Promise((/** @type {any} */ r) => setTimeout(r, delayMs));
      }
      try {
        await start(params, { manualStepping, virtualNow });
        hideErrorOverlay();
        return;
      } catch {
        if (attempt === maxAttempts) throw new Error('Reconnect failed');
      }
    }
  }

  /**
   * @param {StartParams} params
   * @param {StartOptions} [options]
   */
  async function start({ character, guest = false }, { manualStepping, virtualNow } = {}) {
    disconnect();
    ctx.seq = 0;

    let url;
    if (guest) {
      url = buildWsUrl({ character, guest });
    } else if (character?.id) {
      const ticket = await fetchWsTicket(character.id);
      url = buildWsUrl({ character, guest, ticket });
    } else {
      return Promise.reject(new Error('Character required for authenticated connection'));
    }

    return new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
      let resolved = false;
      let disconnectHandled = false;

      function handleUnexpectedDisconnect() {
        if (disconnectHandled) return;
        disconnectHandled = true;
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed.'));
        }
        hideErrorOverlay();
        showErrorOverlay({
          title: 'Connection lost',
          message: 'Check your network and try again.',
          actions: [
            {
              label: 'Reconnect',
              onClick: () => {
                const params = getReconnectParams?.() ?? { guest };
                reconnectWithBackoff(params, { manualStepping, virtualNow }).catch(() => {
                  showErrorOverlay({
                    title: 'Reconnect failed',
                    message: 'Check your network and try again.',
                    actions: [
                      { label: 'Retry', onClick: () => window.location.reload() },
                      { label: 'Back to menu', onClick: () => window.location.reload() },
                    ],
                  });
                });
              },
            },
            {
              label: 'Back to menu',
              onClick: () => {
                hideErrorOverlay();
                disconnect();
                if (!guest) {
                  menu.setOpen(true);
                  ui.setMenuOpen(true);
                  loadCharacters().catch(() => {
                    clearSessionState();
                    menu.setAccount(null);
                    menu.setStep('auth');
                    menu.setTab('signin');
                    ui.setStatus('menu');
                  });
                } else {
                  window.location.reload();
                }
              },
            },
          ],
        });
      }

      const localNet = createNet({
        url,
        onOpen: () => {
          ui.setStatus('connected');
          localNet.send({ type: 'hello' });
        },
        onClose: () => {
          ui.setStatus('disconnected');
          if (!resolved) {
            resolved = true;
            reject(new Error('Connection closed.'));
          }
          if (ctx.closingNet === localNet) {
            ctx.closingNet = null;
            return;
          }
          handleUnexpectedDisconnect();
        },
        onError: () => {
          if (!resolved) {
            resolved = true;
            reject(new Error('Connection failed.'));
          }
          if (ctx.closingNet === localNet) return;
          handleUnexpectedDisconnect();
        },
        onMessage: (/** @type {any} */ msg) => {
          const now = manualStepping ? virtualNow : performance.now();
          if (msg.type === 'welcome') {
            const id = msg.id;
            if (id && id !== ctx.playerId) {
              ctx.playerId = id;
            }
            gameState.setLocalPlayerId(id);
            renderSystem.setLocalPlayerId(id);
            if (msg.config) {
              gameState.setConfigSnapshot(msg.config);
            }
            if (msg.snapshot) {
              handleStateMessage(msg.snapshot, now);
            }
            if (!resolved) {
              resolved = true;
              resolve(undefined);
            }
            if (typeof onConnected === 'function') {
              onConnected();
            }
            pingIntervalId = setInterval(() => {
              if (ctx.net) sendWithSeq({ type: 'ping', t: Date.now() });
            }, 2500);
            return;
          }

          if (msg.type === 'pong') {
            const rtt = Number.isFinite(msg.t) ? Math.round(Date.now() - msg.t) : null;
            if (rtt != null) ctx.pingMs = rtt;
            return;
          }

          if (msg.type === 'state') {
            handleStateMessage(msg, now);
            return;
          }

          if (msg.type === 'me') {
            if (Number.isFinite(msg.t)) {
              gameState.updateServerTime(msg.t);
            }
            gameState.updateMe(msg.data ?? null);
            updateLocalUi();
            return;
          }

          if (msg.type === 'combatEvent') {
            const events = Array.isArray(msg.events) ? msg.events : [];
            const eventTime = Number.isFinite(msg.t) ? msg.t : gameState.getServerNow();
            for (const event of events) {
              onCombatEvents(event, now, eventTime);
            }
            return;
          }

          if (msg.type === 'abilityFailed' && typeof onAbilityFailed === 'function') {
            onAbilityFailed(msg.reason, msg.slot);
            return;
          }

          if (msg.type === 'chat' && typeof onChatMessage === 'function') {
            onChatMessage({
              channel: msg.channel,
              authorId: msg.authorId,
              author: msg.author,
              text: msg.text,
              timestamp: msg.timestamp ?? Date.now(),
            });
          }

          if (msg.type === 'combatLog' && typeof onCombatLog === 'function') {
            const entries = Array.isArray(msg.entries) ? msg.entries : [];
            onCombatLog(entries);
          }

          if (msg.type === 'partyInviteReceived' && typeof onPartyInvite === 'function') {
            onPartyInvite({
              inviterId: msg.inviterId,
              inviterName: msg.inviterName ?? 'Unknown',
            });
          }

          if (msg.type === 'duelRequestReceived' && typeof onDuelRequest === 'function') {
            onDuelRequest({
              challengerId: msg.challengerId,
              challengerName: msg.challengerName ?? 'Unknown',
            });
          }
          if (msg.type === 'duelActive' && typeof onDuelActive === 'function') {
            onDuelActive({
              opponentId: msg.opponentId,
              opponentName: msg.opponentName ?? 'Unknown',
            });
          }
          if (msg.type === 'duelEnded' && typeof onDuelEnded === 'function') {
            onDuelEnded(msg.reason ?? 'ended');
          }
          if (msg.type === 'duelDeclined' && typeof onDuelDeclined === 'function') {
            onDuelDeclined({
              targetId: msg.targetId,
              targetName: msg.targetName ?? 'Unknown',
            });
          }

          if (msg.type === 'tradeRequestReceived' && typeof onTradeRequest === 'function') {
            onTradeRequest({
              traderId: msg.traderId,
              traderName: msg.traderName ?? 'Unknown',
            });
          }
          if (msg.type === 'tradeOpened' && typeof onTradeOpened === 'function') {
            onTradeOpened({
              partnerId: msg.partnerId,
              partnerName: msg.partnerName ?? 'Unknown',
              myOffer: msg.myOffer ?? { items: [], copper: 0 },
              theirOffer: msg.theirOffer ?? { items: [], copper: 0 },
            });
          }
          if (msg.type === 'tradeOfferUpdate' && typeof onTradeOfferUpdate === 'function') {
            onTradeOfferUpdate({
              myOffer: msg.myOffer ?? { items: [], copper: 0 },
              theirOffer: msg.theirOffer ?? { items: [], copper: 0 },
              confirmed: msg.confirmed ?? false,
              theirConfirmed: msg.theirConfirmed ?? false,
            });
          }
          if (msg.type === 'tradeCompleted' && typeof onTradeCompleted === 'function') {
            onTradeCompleted();
          }
          if (msg.type === 'tradeCancelled' && typeof onTradeCancelled === 'function') {
            onTradeCancelled();
          }
          if (msg.type === 'tradeDeclined' && typeof onTradeDeclined === 'function') {
            onTradeDeclined();
          }
          if (msg.type === 'tradeError' && typeof onTradeError === 'function') {
            onTradeError(msg.error);
          }
        },
      });
      ctx.net = localNet;
    });
  }

  function sendInput(/** @type {any} */ keys) {
    sendWithSeq({ type: 'input', keys });
  }

  function sendInteract() {
    sendWithSeq({ type: 'action', kind: 'interact' });
  }

  function sendMoveTarget(/** @type {any} */ pos, /** @type {any} */ opts = {}) {
    if (opts.clearTarget) {
      renderSystem.setTargetMarker(null);
      return;
    }
    if (!pos) return;
    sendWithSeq({ type: 'moveTarget', x: pos.x, y: pos.y ?? 0, z: pos.z });
    renderSystem.setTargetMarker(pos);
  }

  function sendRespawn() {
    sendWithSeq({ type: 'respawn' });
  }

  function sendPartyInvite(/** @type {any} */ targetId) {
    if (targetId) sendWithSeq({ type: 'partyInvite', targetId });
  }

  function sendPartyAccept(/** @type {any} */ inviterId) {
    if (inviterId) sendWithSeq({ type: 'partyAccept', inviterId });
  }

  function sendPartyLeave() {
    sendWithSeq({ type: 'partyLeave' });
  }

  function sendDuelRequest(/** @type {any} */ targetId) {
    if (targetId) sendWithSeq({ type: 'duelRequest', targetId });
  }

  function sendDuelAccept(/** @type {any} */ challengerId) {
    if (challengerId) sendWithSeq({ type: 'duelAccept', challengerId });
  }

  function sendDuelDecline(/** @type {any} */ challengerId) {
    if (challengerId) sendWithSeq({ type: 'duelDecline', challengerId });
  }

  function sendDuelForfeit() {
    sendWithSeq({ type: 'duelForfeit' });
  }

  function sendTradeRequest(/** @type {any} */ targetId) {
    if (targetId) sendWithSeq({ type: 'tradeRequest', targetId });
  }

  function sendTradeAccept(/** @type {any} */ traderId) {
    if (traderId) sendWithSeq({ type: 'tradeAccept', traderId });
  }

  function sendTradeDecline(/** @type {any} */ traderId) {
    if (traderId) sendWithSeq({ type: 'tradeDecline', traderId });
  }

  function sendTradeOfferAddSlot(/** @type {any} */ slot) {
    sendWithSeq({ type: 'tradeOffer', op: 'add', slot });
  }

  function sendTradeOfferAddCopper(/** @type {any} */ amount) {
    sendWithSeq({ type: 'tradeOffer', op: 'add', copper: amount });
  }

  function sendTradeOfferRemoveItem(/** @type {any} */ offerIndex) {
    sendWithSeq({ type: 'tradeOffer', op: 'remove', slot: offerIndex });
  }

  function sendTradeOfferRemoveCopper() {
    sendWithSeq({ type: 'tradeOffer', op: 'remove', copper: 1 });
  }

  function sendTradeConfirm() {
    sendWithSeq({ type: 'tradeConfirm' });
  }

  function sendTradeCancel() {
    sendWithSeq({ type: 'tradeCancel' });
  }

  return {
    start,
    disconnect,
    sendWithSeq,
    sendInput,
    sendInteract,
    sendMoveTarget,
    sendRespawn,
    sendPartyInvite,
    sendPartyAccept,
    sendPartyLeave,
    sendDuelRequest,
    sendDuelAccept,
    sendDuelDecline,
    sendDuelForfeit,
    sendTradeRequest,
    sendTradeAccept,
    sendTradeDecline,
    sendTradeOfferAddSlot,
    sendTradeOfferAddCopper,
    sendTradeOfferRemoveItem,
    sendTradeOfferRemoveCopper,
    sendTradeConfirm,
    sendTradeCancel,
  };
}
