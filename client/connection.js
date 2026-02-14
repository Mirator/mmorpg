import { createNet } from './net.js';
import { showErrorOverlay, hideErrorOverlay, updateErrorOverlayMessage } from './error-overlay.js';

function buildWsUrl({ character, guest, ticket }) {
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = new URL(`${wsProtocol}://${location.host}`);
  if (guest) {
    wsUrl.searchParams.set('guest', '1');
  } else if (character) {
    wsUrl.searchParams.set('characterId', character.id);
    if (ticket) {
      wsUrl.searchParams.set('ticket', ticket);
    }
  }
  return wsUrl.toString();
}

async function fetchWsTicket(characterId) {
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

export function createConnection({
  gameState,
  renderSystem,
  ui,
  ctx,
  onCombatEvents,
  onChatMessage,
  onCombatLog,
  onConnected,
  onPartyInvite,
  updateLocalUi,
  setWorld,
  loadCharacters,
  clearSessionState,
  menu,
  getReconnectParams,
}) {
  function resetClientState() {
    gameState.reset();
    renderSystem.syncPlayers([]);
    renderSystem.setLocalPlayerId(null);
    ctx.currentMe = null;
    ctx.playerId = null;
    ui.updateLocalUi({ me: null, worldConfig: null, serverNow: Date.now() });
  }

  function sendWithSeq(msg) {
    ctx.seq += 1;
    const payload = { ...msg, seq: ctx.seq };
    ctx.net?.send?.(payload);
  }

  function handleStateMessage(msg, now) {
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
      renderSystem.updateWorldMobs(gameState.getLatestMobs());
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
    params,
    { manualStepping, virtualNow, minDelayMs = 1000, maxDelayMs = 30_000, maxAttempts = 10 } = {}
  ) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const delayMs = attempt === 1 ? 0 : Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt - 2));
      if (delayMs > 0) {
        updateErrorOverlayMessage(
          `Retrying in ${Math.ceil(delayMs / 1000)}s… (attempt ${attempt}/${maxAttempts})`
        );
        await new Promise((r) => setTimeout(r, delayMs));
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

    return new Promise((resolve, reject) => {
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
        onMessage: (msg) => {
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
              resolve();
            }
            if (typeof onConnected === 'function') {
              onConnected();
            }
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
        },
      });
      ctx.net = localNet;
    });
  }

  function sendInput(keys) {
    sendWithSeq({ type: 'input', keys });
  }

  function sendInteract() {
    sendWithSeq({ type: 'action', kind: 'interact' });
  }

  function sendMoveTarget(pos, opts = {}) {
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

  function sendPartyInvite(targetId) {
    if (targetId) sendWithSeq({ type: 'partyInvite', targetId });
  }

  function sendPartyAccept(inviterId) {
    if (inviterId) sendWithSeq({ type: 'partyAccept', inviterId });
  }

  function sendPartyLeave() {
    sendWithSeq({ type: 'partyLeave' });
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
  };
}
