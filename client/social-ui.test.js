import { describe, expect, it } from 'vitest';
import { createSocialUi } from './social-ui.js';
import { FakeElement, createFakeDocument } from './test/fakeDom.js';

const REQUIRED_IDS = [
  'party-panel',
  'party-invite-toast',
  'party-leave-btn',
  'party-invite-btn',
  'party-accept-btn',
  'party-decline-btn',
  'party-invite-text',
  'party-hud',
  'duel-panel',
  'duel-request-toast',
  'duel-forfeit-btn',
  'duel-request-btn',
  'duel-accept-btn',
  'duel-decline-btn',
  'duel-request-text',
  'trade-request-btn',
  'trade-request-accept',
  'trade-request-decline',
  'trade-request-toast',
  'trade-request-text',
];

function installSocialUiDom() {
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;
  const { elements, document } = createFakeDocument(REQUIRED_IDS);
  globalThis.document = document;
  globalThis.HTMLElement = /** @type {any} */ (FakeElement);

  const partyStatus = new FakeElement('div');
  partyStatus.className = 'party-status';
  elements['party-panel'].appendChild(partyStatus);

  const duelStatus = new FakeElement('div');
  duelStatus.className = 'duel-status';
  elements['duel-panel'].appendChild(duelStatus);

  return {
    elements,
    restore() {
      globalThis.document = originalDocument;
      globalThis.HTMLElement = originalHTMLElement;
    },
  };
}

function createHarness(overrides = {}) {
  const dom = installSocialUiDom();
  const calls = [];
  const toasts = [];
  const tradeState = {
    open: [],
    partnerName: [],
    offers: [],
    closed: 0,
  };
  const inventoryOpen = [];

  const ctx = {
    currentMe: {
      targetKind: 'player',
      targetId: 'p-2',
      partyId: null,
      duelOpponentId: null,
      partyMemberIds: [],
      x: 0,
      z: 0,
    },
    playerId: 'p-1',
    ...(overrides.ctx ?? {}),
  };

  const gameState = {
    getLatestPlayers: () => ({
      'p-1': { id: 'p-1', name: 'Hero', x: 0, z: 0, hp: 20, maxHp: 20 },
      'p-2': { id: 'p-2', name: 'Rival', x: 3, z: 4, hp: 15, maxHp: 20 },
      'p-3': { id: 'p-3', name: 'Leader', x: 1, z: 2, hp: 18, maxHp: 20 },
      ...(overrides.players ?? {}),
    }),
  };

  const connection = {
    sendPartyInvite(targetId) {
      calls.push(['partyInvite', targetId]);
    },
    sendPartyAccept(inviterId) {
      calls.push(['partyAccept', inviterId]);
    },
    sendPartyLeave() {
      calls.push(['partyLeave']);
    },
    sendDuelRequest(targetId) {
      calls.push(['duelRequest', targetId]);
    },
    sendDuelAccept(challengerId) {
      calls.push(['duelAccept', challengerId]);
    },
    sendDuelDecline(challengerId) {
      calls.push(['duelDecline', challengerId]);
    },
    sendDuelForfeit() {
      calls.push(['duelForfeit']);
    },
    sendTradeRequest(targetId) {
      calls.push(['tradeRequest', targetId]);
    },
    sendTradeAccept(traderId) {
      calls.push(['tradeAccept', traderId]);
    },
    sendTradeDecline(traderId) {
      calls.push(['tradeDecline', traderId]);
    },
    ...(overrides.connection ?? {}),
  };

  const ui = {
    showToast(message) {
      toasts.push(message);
    },
    playerTradeUI: {
      setOpen(value) {
        tradeState.open.push(value);
      },
      setPartnerName(value) {
        tradeState.partnerName.push(value);
      },
      setOffers(value) {
        tradeState.offers.push(value);
      },
      close() {
        tradeState.closed += 1;
      },
    },
    setInventoryOpen(value) {
      inventoryOpen.push(value);
    },
    ...(overrides.ui ?? {}),
  };

  const socialUi = createSocialUi({
    ctx,
    gameState,
    ui,
    getConnection: () => connection,
  });

  return {
    ...dom,
    calls,
    ctx,
    inventoryOpen,
    socialUi,
    toasts,
    tradeState,
  };
}

describe('social ui', () => {
  it('sends a party invite to the selected player and shows a toast', () => {
    const harness = createHarness();
    try {
      harness.elements['party-invite-btn'].listeners.click();

      expect(harness.calls).toContainEqual(['partyInvite', 'p-2']);
      expect(harness.toasts).toContain('Party invite sent to Rival');
    } finally {
      harness.restore();
    }
  });

  it('accepts an incoming party invite and hides the invite toast', () => {
    const harness = createHarness();
    try {
      harness.socialUi.onPartyInvite({ inviterId: 'p-3', inviterName: 'Leader' });
      expect(harness.elements['party-invite-text'].textContent).toBe('Leader invited you to party');
      expect(harness.elements['party-invite-toast'].classList.contains('hidden')).toBe(false);

      harness.elements['party-accept-btn'].listeners.click();

      expect(harness.calls).toContainEqual(['partyAccept', 'p-3']);
      expect(harness.elements['party-invite-toast'].classList.contains('hidden')).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it('renders party HUD rows for visible party members', () => {
    const harness = createHarness({
      ctx: {
        currentMe: {
          targetKind: 'player',
          targetId: 'p-2',
          partyId: 'party-1',
          duelOpponentId: null,
          partyMemberIds: ['p-1', 'p-2', 'p-3'],
          x: 0,
          z: 0,
        },
      },
    });
    try {
      harness.socialUi.updateUi();

      expect(harness.elements['party-hud'].children).toHaveLength(2);
      expect(harness.elements['party-hud'].children[0].children[0].textContent).toBe('Rival');
      expect(harness.elements['party-hud'].children[0].children[1].textContent).toBe('5.0m');
    } finally {
      harness.restore();
    }
  });

  it('opens the trade UI and clears the request toast when trade starts', () => {
    const harness = createHarness();
    try {
      harness.socialUi.onTradeRequest({ traderId: 'p-2', traderName: 'Rival' });
      expect(harness.elements['trade-request-toast'].classList.contains('hidden')).toBe(false);

      harness.socialUi.onTradeOpened({
        partnerName: 'Rival',
        myOffer: { items: [], copper: 0 },
        theirOffer: { items: [{ id: 'ore' }], copper: 3 },
      });

      expect(harness.tradeState.open).toEqual([true]);
      expect(harness.tradeState.partnerName).toEqual(['Rival']);
      expect(harness.tradeState.offers).toHaveLength(1);
      expect(harness.inventoryOpen).toEqual([true]);
      expect(harness.elements['trade-request-toast'].classList.contains('hidden')).toBe(true);
    } finally {
      harness.restore();
    }
  });
});
