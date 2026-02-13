import { createNet } from './net.js';
import { showErrorOverlay, hideErrorOverlay } from './error-overlay.js';

function buildWsUrl({ character, guest }) {
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = new URL(`${wsProtocol}://${location.host}`);
  if (guest) {
    wsUrl.searchParams.set('guest', '1');
  } else if (character) {
    wsUrl.searchParams.set('characterId', character.id);
  }
  return wsUrl.toString();
}

export function createConnection({
  gameState,
  renderSystem,
  ui,
  ctx,
  onCombatEvents,
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
    if (msg.players) {
      gameState.pushSnapshot(msg.players, now);
      renderSystem.syncPlayers(Object.keys(msg.players));
      updateLocalUi();
    }
    if (msg.resources) {
      gameState.updateResources(msg.resources);
      renderSystem.updateWorldResources(msg.resources);
    }
    if (msg.mobs) {
      gameState.updateMobs(msg.mobs);
      renderSystem.updateWorldMobs(msg.mobs);
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

  function start({ character, guest = false }, { manualStepping, virtualNow }) {
    return new Promise((resolve, reject) => {
      disconnect();
      ctx.seq = 0;

      const url = buildWsUrl({ character, guest });
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
                hideErrorOverlay();
                const params = getReconnectParams?.() ?? { guest };
                start(params, { manualStepping, virtualNow }).catch(() => {
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

  return {
    start,
    disconnect,
    sendWithSeq,
    sendInput,
    sendInteract,
    sendMoveTarget,
    sendRespawn,
  };
}
