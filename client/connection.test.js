import { beforeEach, describe, expect, it, vi } from 'vitest';

const netController = vi.hoisted(() => ({
  handlers: null,
  sendCalls: [],
}));

vi.mock('./net.js', () => ({
  createNet: (handlers) => {
    netController.handlers = handlers;
    return {
      send: (msg) => netController.sendCalls.push(msg),
      close: () => {},
    };
  },
}));

vi.mock('./error-overlay.js', () => ({
  showErrorOverlay: () => {},
  hideErrorOverlay: () => {},
  updateErrorOverlayMessage: () => {},
}));

import { createConnection } from './connection.js';

function createGameStateStub() {
  return {
    reset: () => {},
    setLocalPlayerId: () => {},
    setConfigSnapshot: () => {},
    updateServerTime: () => {},
    pushSnapshot: () => {},
    mergePlayers: () => {},
    getLatestPlayers: () => ({}),
    updateResources: () => {},
    mergeResources: () => {},
    getLatestResources: () => [],
    updateMobs: () => {},
    mergeMobs: () => {},
    pushMobSnapshot: () => {},
    getLatestMobs: () => [],
    updateCorpses: () => {},
    mergeCorpses: () => {},
    getLatestCorpses: () => [],
    updateMe: () => {},
  };
}

function createRenderSystemStub() {
  return {
    syncPlayers: () => {},
    setLocalPlayerId: () => {},
    updateWorldResources: () => {},
    updateWorldCorpses: () => {},
    setTargetMarker: () => {},
  };
}

describe('connection messaging', () => {
  beforeEach(() => {
    netController.handlers = null;
    netController.sendCalls = [];
    global.location = {
      protocol: 'http:',
      host: '127.0.0.1:3000',
      pathname: '/',
      reload: () => {},
    };
  });

  it('forwards abilityFailed messages to onAbilityFailed callback', async () => {
    const onAbilityFailed = vi.fn();
    const ctx = { seq: 0, net: null, closingNet: null, currentMe: null, playerId: null };

    const connection = createConnection({
      gameState: createGameStateStub(),
      renderSystem: createRenderSystemStub(),
      ui: {
        updateLocalUi: () => {},
        setStatus: () => {},
        setMenuOpen: () => {},
      },
      ctx,
      onCombatEvents: () => {},
      onAbilityFailed,
      onChatMessage: () => {},
      onCombatLog: () => {},
      onConnected: () => {},
      onPartyInvite: () => {},
      updateLocalUi: () => {},
      setWorld: () => {},
      loadCharacters: async () => {},
      clearSessionState: () => {},
      menu: {
        setOpen: () => {},
        setAccount: () => {},
        setStep: () => {},
        setTab: () => {},
      },
      getReconnectParams: () => ({ guest: true }),
    });

    const startPromise = connection.start({ guest: true }, {});
    expect(netController.handlers).toBeTruthy();

    netController.handlers.onOpen();
    netController.handlers.onMessage({ type: 'welcome', id: 'p1', snapshot: {} });
    await startPromise;

    netController.handlers.onMessage({
      type: 'abilityFailed',
      reason: 'cooldown',
      slot: 2,
    });

    expect(onAbilityFailed).toHaveBeenCalledWith('cooldown', 2);
  });
});
