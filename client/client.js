// @ts-check
import { showErrorOverlay, hideErrorOverlay } from './error-overlay.js';
import { createRenderSystem } from './render.js';
import { createGameState } from './state.js';
import { createInputHandler } from './input.js';
import { createUiState } from './ui-state.js';
import { createMenu } from './menu.js';
import { createAuth } from './auth.js';
import { createConnection } from './connection.js';
import { createCombat } from './combat.js';
import { preloadAllAssets } from './assets.js';
import { resolveTarget } from './targeting.js';
import { getAbilitiesForClass, getClassById } from '/shared/classes.js';
import { splitCurrency, getResourceConfig } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { PLAYER_CONFIG } from '/shared/config.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { createMinimap } from './minimap.js';
import { createChat } from './chat.js';
import { createPauseMenu } from './pause-menu.js';
import { showEntryBanner, hideEntryBanner } from './ui.js';
import { createUiAudio } from './ui-audio.js';

// Ownership boundary: this file composes subsystems; domain logic should stay in focused modules
// (connection/auth/ui-state/combat/input) rather than growing orchestration complexity here.

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const pingEl = document.getElementById('ping-ms');
const coordsEl = document.getElementById('coords');
const accountNameEl = document.getElementById('account-name');
const characterNameEl = document.getElementById('overlay-character-name');
const overlayEl = document.getElementById('overlay');
const loadingScreenEl = document.getElementById('loading-screen');
const loadingStageEl = document.getElementById('loading-stage');
const loadingTextEl = document.getElementById('loading-text');
const loadingTipEl = document.getElementById('loading-tip');
const loadingProgressBarEl = /** @type {HTMLElement | null} */ (document.querySelector('.loading-progress-bar'));
const loadingProgressFillEl = /** @type {HTMLElement | null} */ (document.getElementById('loading-progress-fill'));

const LOADING_TIPS = [
  'Tip: Press K to open skills while in game.',
  'Tip: Drag items onto equipment slots to equip them.',
  'Tip: Press ESC to open the in-game pause menu.',
  'Tip: Use TAB to cycle nearby targets quickly.',
];
let /** @type {ReturnType<typeof setInterval> | null} */ loadingTipInterval = null;
let loadingTipIndex = 0;

function startLoadingTips() {
  if (!loadingTipEl) return;
  loadingTipEl.textContent = LOADING_TIPS[loadingTipIndex % LOADING_TIPS.length];
  if (loadingTipInterval) return;
  loadingTipInterval = setInterval(() => {
    loadingTipIndex = (loadingTipIndex + 1) % LOADING_TIPS.length;
    if (loadingTipEl) loadingTipEl.textContent = LOADING_TIPS[loadingTipIndex];
  }, 3500);
}

function stopLoadingTips() {
  if (loadingTipInterval) {
    clearInterval(loadingTipInterval);
    loadingTipInterval = null;
  }
}

/**
 * @typedef {{
 *   stage?: string;
 *   message?: string;
 *   progress?: number;
 *   indeterminate?: boolean;
 * }} LoadingState
 */

function showLoadingScreen(/** @type {LoadingState | string} */ options = {}) {
  const normalized = typeof options === 'string' ? { message: options } : options;
  const {
    stage = 'Preparing session',
    message = 'Loading...',
    progress = undefined,
    indeterminate = false,
  } = normalized;
  if (loadingStageEl) loadingStageEl.textContent = stage;
  if (loadingTextEl) loadingTextEl.textContent = message;
  loadingScreenEl?.classList.add('visible');
  startLoadingTips();
  if (loadingProgressBarEl) {
    const showBar = indeterminate || typeof progress === 'number';
    loadingProgressBarEl.classList.toggle('hidden', !showBar);
    loadingProgressBarEl.classList.toggle('indeterminate', !!indeterminate);
    if (typeof progress === 'number') {
      const clamped = Math.max(0, Math.min(100, progress));
      loadingProgressBarEl.style.setProperty('--progress', String(clamped));
      loadingProgressBarEl.classList.remove('hidden');
      loadingProgressBarEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
    } else if (showBar) {
      loadingProgressBarEl.removeAttribute('aria-valuenow');
    }
  }
  if (loadingProgressFillEl) {
    loadingProgressFillEl.classList.toggle('hidden', !!indeterminate);
  }
}

function hideLoadingScreen() {
  loadingScreenEl?.classList.remove('visible');
  stopLoadingTips();
}

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const DEFAULT_PLAYER_SPEED = PLAYER_CONFIG.speed;

/**
 * @typedef {{ kind: string, id: string | number }} SelectedTarget
 * @typedef {{
 *   partyId?: string | null;
 *   targetKind?: string | null;
 *   targetId?: string | number | null;
 *   duelOpponentId?: string | number | null;
 *   moveSpeedMultiplier?: number;
 *   [key: string]: any;
 * } | null} LocalPlayerRef
 * @typedef {{ send?: (payload: any) => void, close?: () => void }} NetLike
 * @typedef {{
 *   seq: number;
 *   net: NetLike | null;
 *   closingNet: NetLike | null;
 *   playerId: string | null;
 *   currentMe: LocalPlayerRef;
 *   selectedTarget: SelectedTarget | null;
 *   pingMs: number | null;
 * }} ClientCtx
 */

const renderSystem = createRenderSystem({ app });
const minimap = createMinimap(document.getElementById('minimap-container'));
const gameState = createGameState({
  interpDelayMs: INTERP_DELAY_MS,
  maxSnapshots: MAX_SNAPSHOTS,
  maxSnapshotAgeMs: MAX_SNAPSHOT_AGE_MS,
});

/** @type {ClientCtx} */
const ctx = {
  seq: 0,
  net: null,
  closingNet: null,
  playerId: null,
  currentMe: null,
  selectedTarget: null,
  pingMs: null,
};

let /** @type {any} */ nearestVendor = null;
let inVendorRange = false;
let /** @type {any} */ inputHandler = null;

function sendWithSeq(/** @type {any} */ msg) {
  ctx.seq += 1;
  ctx.net?.send?.({ ...msg, seq: ctx.seq });
}

function setWorld(/** @type {any} */ config) {
  const worldConfig = config ?? null;
  gameState.setWorldConfig(worldConfig);
  renderSystem.updateWorld(worldConfig);
}

function updateLocalUi() {
  const me = gameState.getLocalPlayer();
  const serverNow = gameState.getServerNow();
  ctx.currentMe = me;
  if (me && Object.prototype.hasOwnProperty.call(me, 'targetId')) {
    if (me.targetId) {
      ctx.selectedTarget = { kind: me.targetKind ?? 'mob', id: me.targetId };
    } else if (ctx.selectedTarget?.kind === 'mob') {
      ctx.selectedTarget = null;
    }
  } else if (!me) {
    ctx.selectedTarget = null;
  }
  ui.updateLocalUi({ me, worldConfig: gameState.getWorldConfig(), serverNow });
  if (typeof updatePartyPanel === 'function') updatePartyPanel();
  if (typeof updateDuelPanel === 'function') updateDuelPanel();
}

/** @type {{ current: any | null }} */
const authRef = { current: null };
/** @type {{ current: any | null }} */
const connectionRef = { current: null };
/** @type {{ current: any | null }} */
const combatRef = { current: null };
const uiAudio = createUiAudio();
const pauseVolumeEl = /** @type {HTMLInputElement | null} */ (document.getElementById('pause-volume'));
if (pauseVolumeEl) {
  pauseVolumeEl.value = uiAudio.isEnabled() ? '100' : '0';
  pauseVolumeEl.addEventListener('input', () => {
    const value = Number.parseInt(pauseVolumeEl.value ?? '0', 10);
    uiAudio.setEnabled(Number.isFinite(value) && value > 0);
  });
}

const chat = createChat({
  onSend: (/** @type {any} */ channel, /** @type {any} */ text) => {
    sendWithSeq({ type: 'chat', channel, text });
  },
  isInParty: () => !!ctx.currentMe?.partyId,
});

const ui = createUiState({
  onInventorySwap: (/** @type {any} */ from, /** @type {any} */ to) => {
    sendWithSeq({ type: 'inventorySwap', from, to });
  },
  onEquipmentSwap: (/** @type {any} */ { fromType, fromSlot, toType, toSlot }) => {
    sendWithSeq({ type: 'equipSwap', fromType, fromSlot, toType, toSlot });
  },
  onVendorSell: (/** @type {any} */ slot, /** @type {any} */ vendorId) => {
    sendWithSeq({ type: 'vendorSell', slot, vendorId });
  },
  onVendorBuy: (/** @type {any} */ kind, /** @type {any} */ count, /** @type {any} */ vendorId) => {
    sendWithSeq({ type: 'vendorBuy', vendorId, kind, count });
  },
  onCraft: (/** @type {any} */ recipeId, /** @type {any} */ count) => {
    sendWithSeq({ type: 'craft', recipeId, count });
  },
  onAbilityClick: (/** @type {any} */ slot) => {
    combatRef.current?.useAbility(slot);
  },
  onUiOpen: () => {
    inputHandler?.clearMovement();
  },
  onRespawn: () => {
    connectionRef.current?.sendRespawn();
  },
  isChatFocused: () => chat.isChatFocused(),
  onTradeOfferAddSlot: (/** @type {any} */ slot) => connectionRef.current?.sendTradeOfferAddSlot?.(slot),
  onTradeOfferAddCopper: (/** @type {any} */ amount) => connectionRef.current?.sendTradeOfferAddCopper?.(amount),
  onTradeOfferRemoveItem: (/** @type {any} */ index) => connectionRef.current?.sendTradeOfferRemoveItem?.(index),
  onTradeOfferRemoveCopper: () => connectionRef.current?.sendTradeOfferRemoveCopper?.(),
  onTradeConfirm: () => connectionRef.current?.sendTradeConfirm?.(),
  onTradeCancel: () => connectionRef.current?.sendTradeCancel?.(),
});

const menu = createMenu({
  onSignIn: (/** @type {any} */ data) => authRef.current?.signIn(data),
  onSignUp: (/** @type {any} */ data) => authRef.current?.signUp(data),
  onSelectCharacter: (/** @type {any} */ char) => authRef.current?.connectCharacter(char),
  onCreateCharacter: (/** @type {any} */ data) => authRef.current?.createCharacter(data),
  onDeleteCharacter: (/** @type {any} */ char) => authRef.current?.deleteCharacter(char),
  onSignOut: () => authRef.current?.signOut(),
});

const auth = createAuth({
  menu,
  ui,
  accountNameEl,
  characterNameEl,
  uiAudio,
});
authRef.current = auth;

const combat = createCombat({
  gameState,
  ui,
  renderSystem,
  sendWithSeq,
  ctx,
});
combatRef.current = combat;

/** @type {{ inviterId: string | number, inviterName: string } | null} */
let pendingPartyInvite = null;
/** @type {{ challengerId: string | number, challengerName: string } | null} */
let pendingDuelRequest = null;
/** @type {{ traderId: string | number, traderName: string } | null} */
let pendingTradeRequest = null;

function updateLoadingFromNetworkStage(/** @type {any} */ stage) {
  if (stage === 'socket_open') {
    showLoadingScreen({
      stage: 'Connecting realm',
      message: 'Realm link established. Handshaking...',
      indeterminate: true,
    });
    return;
  }
  if (stage === 'awaiting_welcome') {
    showLoadingScreen({
      stage: 'Syncing world state',
      message: 'Syncing character and world snapshot...',
      indeterminate: true,
    });
    return;
  }
  if (stage === 'world_ready') {
    showLoadingScreen({
      stage: 'Syncing world state',
      message: 'Finalizing entry...',
      progress: 100,
    });
  }
}

const connection = createConnection({
  gameState,
  renderSystem,
  ui,
  ctx,
  onCombatEvents: (/** @type {any} */ event, /** @type {any} */ now, /** @type {any} */ eventTime) =>
    combat.handleCombatEvent(event, now, eventTime),
  onAbilityFailed: (/** @type {any} */ reason, /** @type {any} */ slot) => ui.showAbilityError(reason, slot),
  onChatMessage: (/** @type {any} */ data) => {
    const channel = data?.channel ?? 'area';
    chat.addMessage(channel, data);
  },
  onCombatLog: (/** @type {any} */ entries) => chat.addCombatLogEntries(entries),
  onConnected: () => {
    chat.addSystemMessage('Connected to game');
    uiAudio.play('success');
  },
  onPartyInvite: (/** @type {any} */ invite) => {
    pendingPartyInvite = invite;
    const panel = document.getElementById('party-panel');
    const toast = document.getElementById('party-invite-toast');
    const textEl = document.getElementById('party-invite-text');
    if (panel && toast && textEl) {
      panel.classList.remove('hidden');
      toast.classList.remove('hidden');
      textEl.textContent = `${invite.inviterName} invited you to party`;
    }
  },
  onDuelRequest: (/** @type {any} */ req) => {
    pendingDuelRequest = req;
    const panel = document.getElementById('duel-panel');
    const toast = document.getElementById('duel-request-toast');
    const textEl = document.getElementById('duel-request-text');
    if (panel && toast && textEl) {
      panel.classList.remove('hidden');
      toast.classList.remove('hidden');
      textEl.textContent = `${req.challengerName} challenges you to a duel`;
    }
  },
  onDuelActive: () => {
    pendingDuelRequest = null;
    const toast = document.getElementById('duel-request-toast');
    if (toast) toast.classList.add('hidden');
  },
  onDuelEnded: (/** @type {any} */ reason) => {
    pendingDuelRequest = null;
    const toast = document.getElementById('duel-request-toast');
    if (toast) toast.classList.add('hidden');
    ui.showToast?.(reason === 'forfeit' ? 'Duel forfeited' : reason === 'death' ? 'Duel ended' : 'Duel ended');
  },
  onDuelDeclined: (/** @type {any} */ data) => {
    ui.showToast?.(`${data.targetName} declined your duel`);
  },
  onTradeRequest: (/** @type {any} */ req) => {
    pendingTradeRequest = req;
    const toast = document.getElementById('trade-request-toast');
    const textEl = document.getElementById('trade-request-text');
    if (toast && textEl) {
      toast.classList.remove('hidden');
      textEl.textContent = `${req.traderName} wants to trade`;
    }
  },
  onTradeOpened: (/** @type {any} */ data) => {
    pendingTradeRequest = null;
    const toast = document.getElementById('trade-request-toast');
    if (toast) toast.classList.add('hidden');
    ui.playerTradeUI?.setOpen?.(true);
    ui.playerTradeUI?.setPartnerName?.(data.partnerName);
    ui.playerTradeUI?.setOffers?.({
      myOffer: data.myOffer,
      theirOffer: data.theirOffer,
      confirmed: false,
      theirConfirmed: false,
    });
    ui.setInventoryOpen?.(true);
  },
  onTradeOfferUpdate: (/** @type {any} */ data) => {
    ui.playerTradeUI?.setOffers?.(data);
  },
  onTradeCompleted: () => {
    ui.playerTradeUI?.close?.();
    ui.showToast?.('Trade completed');
  },
  onTradeCancelled: () => {
    ui.playerTradeUI?.close?.();
    ui.showToast?.('Trade cancelled');
  },
  onTradeDeclined: () => {
    ui.showToast?.('Trade declined');
  },
  onTradeError: (/** @type {any} */ err) => {
    ui.showToast?.(`Trade error: ${err ?? 'unknown'}`);
  },
  updateLocalUi,
  setWorld,
  loadCharacters: () => auth.loadCharacters(),
  clearSessionState: () => auth.clearSessionState(),
  menu,
  getReconnectParams: () =>
    isGuestSession ? { guest: true } : { character: auth.getCharacter() },
  onStageChange: updateLoadingFromNetworkStage,
});
connectionRef.current = connection;

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
  if (leaveBtn) {
    leaveBtn.style.display = inParty ? 'inline-block' : 'none';
  }
  if (inviteBtn) {
    inviteBtn.style.display = hasPlayerTarget ? 'inline-block' : 'none';
  }
}

function updateDuelPanel() {
  const panel = document.getElementById('duel-panel');
  const toast = document.getElementById('duel-request-toast');
  const statusEl = panel?.querySelector('.duel-status');
  const forfeitBtn = document.getElementById('duel-forfeit-btn');
  const requestBtn = document.getElementById('duel-request-btn');
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
  if (forfeitBtn) {
    forfeitBtn.style.display = inDuel ? 'inline-block' : 'none';
  }
  if (requestBtn) {
    requestBtn.style.display = hasPlayerTarget && !inDuel ? 'inline-block' : 'none';
  }
  const tradeRequestBtn = document.getElementById('trade-request-btn');
  if (tradeRequestBtn) {
    tradeRequestBtn.style.display = hasPlayerTarget && !inDuel ? 'inline-block' : 'none';
  }
}

function initPartyButtons() {
  const leaveBtn = document.getElementById('party-leave-btn');
  const inviteBtn = document.getElementById('party-invite-btn');
  const acceptBtn = document.getElementById('party-accept-btn');
  const declineBtn = document.getElementById('party-decline-btn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      connection.sendPartyLeave();
    });
  }
  if (inviteBtn) {
    inviteBtn.addEventListener('click', () => {
      const targetId = ctx.currentMe?.targetId;
      if (targetId && ctx.currentMe?.targetKind === 'player') {
        connection.sendPartyInvite(targetId);
        const target = resolveTarget({ kind: 'player', id: targetId }, {
          players: gameState.getLatestPlayers(),
          mobs: {},
          vendors: [],
        });
        ui.showToast?.(`Party invite sent to ${target?.name ?? 'player'}`);
      }
    });
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (pendingPartyInvite) {
        connection.sendPartyAccept(pendingPartyInvite.inviterId);
        pendingPartyInvite = null;
        const toast = document.getElementById('party-invite-toast');
        if (toast) toast.classList.add('hidden');
      }
    });
  }
  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      pendingPartyInvite = null;
      const toast = document.getElementById('party-invite-toast');
      if (toast) toast.classList.add('hidden');
      const panel = document.getElementById('party-panel');
      if (panel && !ctx.currentMe?.partyId) panel.classList.add('hidden');
    });
  }
}
initPartyButtons();

function initDuelButtons() {
  const forfeitBtn = document.getElementById('duel-forfeit-btn');
  const requestBtn = document.getElementById('duel-request-btn');
  const acceptBtn = document.getElementById('duel-accept-btn');
  const declineBtn = document.getElementById('duel-decline-btn');
  if (forfeitBtn) {
    forfeitBtn.addEventListener('click', () => connection.sendDuelForfeit());
  }
  if (requestBtn) {
    requestBtn.addEventListener('click', () => {
      const targetId = ctx.currentMe?.targetId;
      if (targetId && ctx.currentMe?.targetKind === 'player') {
        connection.sendDuelRequest(targetId);
        const target = resolveTarget({ kind: 'player', id: targetId }, {
          players: gameState.getLatestPlayers(),
          mobs: {},
          vendors: [],
        });
        ui.showToast?.(`Duel challenge sent to ${target?.name ?? 'player'}`);
      }
    });
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (pendingDuelRequest) {
        connection.sendDuelAccept(pendingDuelRequest.challengerId);
        pendingDuelRequest = null;
        const toast = document.getElementById('duel-request-toast');
        if (toast) toast.classList.add('hidden');
      }
    });
  }
  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      if (pendingDuelRequest) {
        connection.sendDuelDecline(pendingDuelRequest.challengerId);
        pendingDuelRequest = null;
        const toast = document.getElementById('duel-request-toast');
        if (toast) toast.classList.add('hidden');
        const panel = document.getElementById('duel-panel');
        if (panel && !ctx.currentMe?.duelOpponentId) panel.classList.add('hidden');
      }
    });
  }
}
initDuelButtons();

function initTradeButtons() {
  const tradeRequestBtn = document.getElementById('trade-request-btn');
  const acceptBtn = document.getElementById('trade-request-accept');
  const declineBtn = document.getElementById('trade-request-decline');
  if (tradeRequestBtn) {
    tradeRequestBtn.addEventListener('click', () => {
      const targetId = ctx.currentMe?.targetId;
      if (targetId && ctx.currentMe?.targetKind === 'player') {
        connection.sendTradeRequest(targetId);
        const target = resolveTarget({ kind: 'player', id: targetId }, {
          players: gameState.getLatestPlayers(),
          mobs: {},
          vendors: [],
        });
        ui.showToast?.(`Trade request sent to ${target?.name ?? 'player'}`);
      }
    });
  }
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      if (pendingTradeRequest) {
        connection.sendTradeAccept(pendingTradeRequest.traderId);
        pendingTradeRequest = null;
        const toast = document.getElementById('trade-request-toast');
        if (toast) toast.classList.add('hidden');
      }
    });
  }
  if (declineBtn) {
    declineBtn.addEventListener('click', () => {
      if (pendingTradeRequest) {
        connection.sendTradeDecline(pendingTradeRequest.traderId);
        pendingTradeRequest = null;
        const toast = document.getElementById('trade-request-toast');
        if (toast) toast.classList.add('hidden');
      }
    });
  }
}
initTradeButtons();

auth.setOnConnectCharacter(async (/** @type {any} */ character) => {
  showLoadingScreen({
    stage: 'Preparing session',
    message: 'Preparing character session...',
    indeterminate: true,
  });
  try {
    await preloadAllAssets((/** @type {any} */ loaded, /** @type {any} */ total) => {
      showLoadingScreen({
        stage: 'Loading world assets',
        message: `Loading world assets... ${loaded}/${total}`,
        progress: Math.round((loaded / total) * 100),
      });
    });
    showLoadingScreen({
      stage: 'Connecting realm',
      message: 'Opening realm link...',
      indeterminate: true,
    });
    await connection.start({ character }, { manualStepping, virtualNow, onStageChange: updateLoadingFromNetworkStage });
    showLoadingScreen({
      stage: 'Syncing world state',
      message: 'Spawning your character...',
      progress: 100,
    });
    const klass = getClassById(character?.classId);
    showEntryBanner({
      title: character?.name ?? 'Adventurer',
      subtitle: `${klass?.name ?? character?.classId ?? 'Class'} · Ready for battle`,
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
  } finally {
    hideLoadingScreen();
  }
});
auth.setOnDisconnect(() => connection.disconnect());

const urlParams = new URLSearchParams(window.location.search);
const isGuestSession = urlParams.get('guest') === '1';

const FPS_STORAGE_KEY = 'mmorpg_show_fps';

function getShowFps() {
  try {
    return localStorage.getItem(FPS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function setShowFps(/** @type {any} */ value) {
  try {
    localStorage.setItem(FPS_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  const fpsRow = fpsEl?.closest?.('#hud')?.querySelector?.('.hud-fps-row');
  if (fpsRow) fpsRow.classList.toggle('hidden', !value);
}

const pauseMenu = createPauseMenu({
  onResume: () => {
    pauseMenu.setOpen(false);
  },
  onReturnToCharacterScreen: () => {
    pauseMenu.setOpen(false);
    auth.returnToCharacterSelect();
  },
  onSignOut: () => {
    pauseMenu.setOpen(false);
    auth.signOut();
  },
  isGuest: isGuestSession,
  setPauseMenuOpen: ui.setPauseMenuOpen,
  getShowFps,
  setShowFps,
});

let lastFrameTime = performance.now();
let fpsLastTime = lastFrameTime;
let fpsFrameCount = 0;
let manualStepping = false;
let virtualNow = performance.now();

inputHandler = createInputHandler({
  renderer: renderSystem.renderer,
  camera: renderSystem.camera,
  isUiBlocking: ui.isUiBlocking,
  isMenuOpen: ui.isMenuOpen,
  isPauseMenuOpen: ui.isPauseMenuOpen,
  isDialogOpen: ui.isDialogOpen,
  isTradeOpen: ui.isTradeOpen,
  isInventoryOpen: ui.isInventoryOpen,
  isSkillsOpen: ui.isSkillsOpen,
  onToggleInventory: ui.toggleInventory,
  onToggleCharacter: ui.toggleCharacter,
  onToggleSkills: ui.toggleSkills,
  onToggleFullscreen: () => {
    if (!document.fullscreenElement) {
      renderSystem.renderer.domElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  },
  onInteract: handleInteract,
  onAbility: (/** @type {any} */ slot) => combat.useAbility(slot),
  onMoveTarget: (/** @type {any} */ pos, /** @type {any} */ opts) => connection.sendMoveTarget(pos, opts),
  onInputChange: (/** @type {any} */ keys) => {
    connection.sendInput(keys);
    if (keys?.w || keys?.a || keys?.s || keys?.d) {
      hideEntryBanner();
    }
  },
  onTargetSelect: combat.selectTarget,
  onCycleTarget: combat.cycleTarget,
  pickTarget: (/** @type {any} */ ndc) => renderSystem.pickTarget(ndc),
  onTradeTab: (/** @type {any} */ tab) => ui.vendorUI?.setTab?.(tab),
  getPlacementMode: () => combat.getPlacementMode(),
  onPlacementConfirm: (/** @type {any} */ pos) => combat.confirmPlacement(pos),
  onPlacementCancel: () => combat.cancelPlacement(),
  onPlacementUpdate: (/** @type {any} */ pos) => combat.updatePlacementCursor(pos),
  onTogglePauseMenu: () => {
    if (ctx.net && !ui.isMenuOpen()) {
      if (pauseMenu.isOpen()) {
        pauseMenu.handleEscape();
      } else {
        pauseMenu.setOpen(true);
      }
    }
  },
});

function handleInteract() {
  if (ui.isTradeOpen()) return;
  if (ui.isDialogOpen() && ui.vendorUI) {
    ui.vendorUI.openTrade();
    ui.setInventoryOpen(true);
    return;
  }
  if (ui.isInventoryOpen()) return;
  const me = gameState.getLocalPlayer();
  const pos = me ? { x: me.x, y: me.y ?? 0, z: me.z } : null;
  const { vendor, distance } = pos ? getNearestVendor(pos) : { vendor: null, distance: Infinity };
  const maxDist = gameState.getWorldConfig()?.vendorInteractRadius ?? 2.5;
  const targetVendor = vendor ?? nearestVendor;
  const inRange = vendor ? distance <= maxDist : inVendorRange;
  if (inRange && targetVendor && ui.vendorUI) {
    ui.vendorUI.openDialog(targetVendor);
    ui.clearPrompt();
    return;
  }
  connection.sendInteract();
}

function getPlayerSpeed() {
  const worldConfig = gameState.getWorldConfig();
  const configSnapshot = gameState.getConfigSnapshot();
  const baseSpeed =
    worldConfig?.playerSpeed ?? configSnapshot?.player?.speed ?? DEFAULT_PLAYER_SPEED;
  const multiplier = ctx.currentMe?.moveSpeedMultiplier ?? 1;
  return baseSpeed * multiplier;
}

function stepFrame(/** @type {any} */ dt, /** @type {any} */ now) {
  const { positions, localPos: serverLocalPos } = gameState.renderInterpolatedPlayers(now);
  const latestPlayers = gameState.getLatestPlayers();
  renderSystem.updatePlayerPositions(positions, {
    localPlayerId: ctx.playerId ?? null,
    inputKeys: inputHandler.getKeys(),
    playerStates: latestPlayers,
  });

  const localState = gameState.getLocalPlayer();
  if (localState?.dead && serverLocalPos) {
    gameState.resetPrediction(serverLocalPos);
  }

  const canPredict = !localState?.dead;
  const predictedPos = canPredict
    ? gameState.updateLocalPrediction(dt, serverLocalPos, inputHandler.getKeys(), getPlayerSpeed())
    : serverLocalPos;
  const viewPos = predictedPos ?? serverLocalPos;

  if (predictedPos && ctx.playerId) {
    renderSystem.updatePlayerPositions(
      { [ctx.playerId]: predictedPos },
      {
        localPlayerId: ctx.playerId,
        inputKeys: inputHandler.getKeys(),
        playerStates: latestPlayers,
      }
    );
  }

  if (viewPos) {
    const cameraTarget = renderSystem.updateCamera(viewPos, dt);
    if (cameraTarget) renderSystem.updateVisibility(cameraTarget);
    if (coordsEl) {
      coordsEl.textContent = `${viewPos.x.toFixed(1)}, ${(viewPos.y ?? 0).toFixed(1)}, ${viewPos.z.toFixed(1)}`;
    }
  } else if (coordsEl) {
    coordsEl.textContent = '--, --, --';
  }

  const interpolatedMobs = gameState.renderInterpolatedMobs(now);
  renderSystem.updateWorldMobs(interpolatedMobs);

  renderSystem.animateWorldMeshes(now);
  const players = latestPlayers;
  const deadPlayerIds = new Set();
  if (players && typeof players === 'object') {
    for (const [id, p] of Object.entries(players)) {
      if (p?.dead) deadPlayerIds.add(id);
    }
  }
  renderSystem.updateAnimations(dt, now, deadPlayerIds);
  renderSystem.updateEffects(now);
  const resolvedTarget = resolveTarget(ctx.selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: gameState.getWorldConfig()?.vendors ?? [],
  });
  if (!resolvedTarget && ctx.selectedTarget) {
    ctx.selectedTarget = null;
  }
  if (resolvedTarget?.pos) {
    renderSystem.setTargetRing({
      x: resolvedTarget.pos.x,
      y: resolvedTarget.pos.y ?? 0,
      z: resolvedTarget.pos.z,
    });
  } else {
    renderSystem.setTargetRing(null);
  }
  ui.updateTargetHud(resolvedTarget);

  ui.updateAbilityBar(
    ctx.currentMe,
    gameState.getServerNow(),
    gameState.getConfigSnapshot()?.combat?.globalCooldownMs ?? 900
  );

  if (combat.getPlacementMode()) {
    document.body.style.cursor = 'crosshair';
  } else {
    document.body.style.cursor = '';
  }
  if (ui.isSkillsOpen()) {
    ui.updateSkillsPanel(ctx.currentMe);
  }

  nearestVendor = null;
  inVendorRange = false;
  if (viewPos) {
    const { vendor, distance } = getNearestVendor(viewPos);
    const maxDist = gameState.getWorldConfig()?.vendorInteractRadius ?? 2.5;
    nearestVendor = vendor;
    if (vendor && distance <= maxDist) {
      inVendorRange = true;
    }
  }

  if (ui.isUiBlocking()) {
    ui.clearPrompt();
  } else if (inVendorRange && nearestVendor) {
    ui.showPrompt(`Press E to talk to ${nearestVendor.name ?? 'Vendor'}`);
  } else if (viewPos && gameState.getLatestResources().length) {
    const radius = gameState.getWorldConfig()?.harvestRadius ?? 2;
    const invCap =
      localState?.invCap ??
      (gameState.getWorldConfig()?.playerInvSlots &&
      gameState.getWorldConfig()?.playerInvStackMax
        ? gameState.getWorldConfig().playerInvSlots * gameState.getWorldConfig().playerInvStackMax
        : 5);
    const inv = localState?.inv ?? 0;
    let /** @type {any} */ nearestResource = null;
    const radiusSq = radius * radius;
    if (!localState?.dead && inv < invCap) {
      for (const resource of gameState.getLatestResources()) {
        if (!resource.available) continue;
        const dx = resource.x - viewPos.x;
        const dz = resource.z - viewPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= radiusSq && (!nearestResource || distSq < nearestResource.distSq)) {
          nearestResource = { ...resource, distSq };
        }
      }
    }
    if (nearestResource) {
      const resourceType = nearestResource.type ?? 'crystal';
      const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
      ui.showPrompt(`Press E to harvest ${itemName}`);
    } else {
      ui.clearPrompt();
    }
  } else {
    ui.clearPrompt();
  }

  combat.pruneCombatEvents(gameState.getServerNow());

  const fpsRow = document.getElementById('hud')?.querySelector('.hud-fps-row');
  if (fpsRow) fpsRow.classList.toggle('hidden', !getShowFps());

  if (pingEl) {
    const ms = ctx.pingMs;
    pingEl.textContent = ms != null ? `${ms} ms` : '--';
  }

  fpsFrameCount += 1;
  if (now - fpsLastTime >= 1000) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastTime);
    if (fpsEl) fpsEl.textContent = fps.toFixed(0);
    fpsFrameCount = 0;
    fpsLastTime = now;
  }

  renderSystem.renderFrame();
  minimap.render({
    playerPos: viewPos,
    mobs: gameState.getLatestMobs(),
    resources: gameState.getLatestResources(),
    worldConfig: gameState.getWorldConfig(),
  });
}

function animate() {
  if (!renderSystem.isWebGLReady()) {
    return;
  }
  if (manualStepping) {
    requestAnimationFrame(animate);
    return;
  }
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  stepFrame(dt, now);
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
  renderSystem.resize();
  minimap.resize();
});
renderSystem.resize();
minimap.resize();

if (renderSystem.isWebGLReady()) {
  animate();
}

window.advanceTime = (/** @type {any} */ ms) => {
  manualStepping = true;
  const stepMs = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / stepMs));
  for (let i = 0; i < steps; i += 1) {
    virtualNow += stepMs;
    stepFrame(stepMs / 1000, virtualNow);
  }
  return Promise.resolve();
};

function buildTextState() {
  const me = gameState.getLocalPlayer();
  const worldConfig = gameState.getWorldConfig();
  const base = worldConfig?.base ?? null;
  const obstacles = worldConfig?.obstacles ?? [];
  const collisionObstacles = worldConfig?.collisionObstacles ?? obstacles;
  const structures = worldConfig?.structures ?? [];
  const mapSize = worldConfig?.mapSize ?? 0;
  const harvestRadius = worldConfig?.harvestRadius ?? 2;
  const inventorySlots = Array.isArray(me?.inventory) ? me.inventory : [];
  const inventoryOpen = ui.isInventoryOpen();
  const tradeOpen = ui.isTradeOpen();
  const dialogOpen = ui.isDialogOpen();
  const classId = ui.getCurrentClassId(me);
  const weaponDef = getEquippedWeapon(me?.equipment, classId);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
  const serverNow = gameState.getServerNow();
  const vendor = ui.vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? ui.vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  const menuState = menu.getState();
  const target = resolveTarget(ctx.selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: worldConfig?.vendors ?? [],
  });

  return {
    mode: ui.isMenuOpen() ? 'menu' : 'play',
    menu: {
      ...menuState,
      account: auth.getAccount()?.username ?? null,
      character: auth.getCharacter()?.name ?? null,
    },
    coordSystem: {
      origin: 'map center',
      axes: { x: 'right', z: 'down', y: 'up' },
      units: 'world units',
    },
    world: {
      mapSize,
      base,
      harvestRadius,
      vendors: worldConfig?.vendors ?? [],
      vendorInteractRadius: worldConfig?.vendorInteractRadius ?? 2.5,
      obstacles: obstacles.map((/** @type {any} */ o) => ({ x: o.x, z: o.z, r: o.r ?? o.radius })),
      collisionObstacles: collisionObstacles.map((/** @type {any} */ o) => ({
        x: o.x,
        z: o.z,
        r: o.r ?? o.radius,
      })),
      structures: structures.map((/** @type {any} */ structure) => ({
        id: structure.id,
        kind: structure.kind,
        x: structure.x,
        z: structure.z,
        rotation: structure.rotation ?? 0,
        colliderRadius: structure.colliderRadius,
        collides: structure.collides !== false,
      })),
    },
    serverTime: gameState.getServerNow(),
    player: me
      ? {
          id: ctx.playerId,
          x: me.x,
          z: me.z,
          hp: me.hp,
          maxHp: me.maxHp,
          classId,
          level: me.level ?? 1,
          xp: me.xp ?? 0,
          xpToNext: me.xpToNext ?? xpToNext(me.level ?? 1),
          attackCooldownUntil: me.attackCooldownUntil ?? 0,
          targetId: me.targetId ?? null,
          targetKind: me.targetKind ?? null,
          resourceType: me.resourceType ?? null,
          resourceMax: me.resourceMax ?? 0,
          resource: me.resource ?? 0,
          abilityCooldowns: me.abilityCooldowns ?? {},
          globalCooldownUntil: me.globalCooldownUntil ?? 0,
          moveSpeedMultiplier: me.moveSpeedMultiplier ?? 1,
          equipment: me.equipment ?? null,
          weapon: weaponDef
            ? {
                kind: weaponDef.kind,
                name: weaponDef.name,
                attackType: weaponDef.attackType,
                range: weaponDef.range,
              }
            : null,
          inv: me.inv,
          invCap: me.invCap,
          invSlots: me.invSlots,
          invStackMax: me.invStackMax,
          currencyCopper,
          currency: splitCurrency(currencyCopper),
          dead: me.dead,
          respawnAt: me.respawnAt ?? 0,
        }
      : null,
    target: target
      ? {
          kind: target.kind,
          id: target.id,
          name: target.name ?? null,
          level: target.level ?? null,
          hp: target.hp ?? null,
          maxHp: target.maxHp ?? null,
        }
      : null,
    skills: {
      open: ui.isSkillsOpen(),
    },
    abilities: abilities.map((/** @type {any} */ ability) => ({
      id: ability.id,
      name: ability.name,
      slot: ability.slot,
      cooldownMs: ability.cooldownMs ?? 0,
      range: ability.range ?? 0,
      attackType: ability.attackType ?? null,
      targetType: ability.targetType ?? 'none',
      targetKind: ability.targetKind ?? null,
      cooldownRemainingMs: Math.max(
        0,
        (ability.id === 'basic_attack'
          ? me?.attackCooldownUntil ?? 0
          : me?.abilityCooldowns?.[ability.id] ?? 0) - serverNow
      ),
    })),
    combat: {
      targetSelectRange: combat.getTargetSelectRange(),
      recentEvents: combat.getCombatEvents()
        .filter((/** @type {any} */ event) => event.attackerId === ctx.playerId)
        .map((/** @type {any} */ event) => ({
          kind: event.kind ?? null,
          attackType: event.attackType ?? null,
          attackerId: event.attackerId ?? null,
          targetId: event.targetId ?? null,
          from: event.from ?? null,
          to: event.to ?? null,
          hit: !!event.hit,
          durationMs: event.durationMs ?? 0,
          impacts: Array.isArray(event.impacts)
            ? event.impacts.map((/** @type {any} */ impact) => ({
                kind: impact.kind ?? null,
                amount: Number.isFinite(impact.amount) ? impact.amount : 0,
                isCrit: !!impact.isCrit,
                targetId: impact.targetId ?? null,
                targetKind: impact.targetKind ?? null,
                x: Number.isFinite(impact.x) ? impact.x : null,
                y: Number.isFinite(impact.y) ? impact.y : null,
                z: Number.isFinite(impact.z) ? impact.z : null,
              }))
            : [],
          t: event.t ?? null,
        })),
    },
    trade: {
      dialogOpen,
      tradeOpen,
      tab: tradeTab,
      vendorId: vendor?.id ?? null,
    },
    inventory: {
      open: inventoryOpen,
      slots: inventorySlotCount,
      stackMax: inventoryStackMax,
      items: inventorySlots
        .map((/** @type {any} */ item, /** @type {any} */ index) =>
          item
            ? {
                slot: index,
                id: item.id ?? null,
                kind: item.kind ?? null,
                name: item.name ?? null,
                count: item.count ?? 0,
              }
            : null
        )
        .filter(Boolean),
    },
    resources: gameState.getLatestResources().map((/** @type {any} */ r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
      available: r.available,
      respawnAt: r.respawnAt ?? 0,
    })),
    mobs: gameState.getLatestMobs().map((/** @type {any} */ m) => ({
      id: m.id,
      x: m.x,
      z: m.z,
      state: m.state,
      targetId: m.targetId ?? null,
      level: m.level ?? 1,
      hp: m.hp ?? 0,
      maxHp: m.maxHp ?? 0,
      dead: !!m.dead,
      respawnAt: m.respawnAt ?? 0,
    })),
  };
}

window.render_game_to_text = () => JSON.stringify(buildTextState());

window.__game = {
  moveTo: (/** @type {any} */ x, /** @type {any} */ z) => {
    connection.sendMoveTarget({ x, z });
  },
  clearInput: () => {
    connection.sendInput({ w: false, a: false, s: false, d: false });
  },
  interact: () => {
    connection.sendInteract();
  },
  projectToScreen: (/** @type {any} */ x, /** @type {any} */ z) => {
    return renderSystem.projectToScreen({ x, z });
  },
  getState: () => buildTextState(),
  selectTarget: (/** @type {any} */ selection) => {
    combat.selectTarget(selection);
  },
};

function getNearestVendor(/** @type {any} */ pos) {
  const worldConfig = gameState.getWorldConfig();
  if (!pos || !Array.isArray(worldConfig?.vendors)) {
    return { vendor: null, distance: Infinity };
  }
  let /** @type {any} */ bestVendor = null;
  let bestDist = Infinity;
  for (const vendor of worldConfig.vendors) {
    const dx = vendor.x - pos.x;
    const dz = vendor.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestVendor = vendor;
    }
  }
  return { vendor: bestVendor, distance: bestDist };
}

if (overlayEl) {
  overlayEl.addEventListener('mouseenter', () => {
    overlayEl.classList.add('hovered');
  });
  overlayEl.addEventListener('mouseleave', () => {
    overlayEl.classList.remove('hovered');
  });
}

if (isGuestSession) {
  ui.setMenuOpen(false);
  menu.setOpen(false);
  auth.setGuestAccount();
  (async () => {
    showLoadingScreen({
      stage: 'Preparing session',
      message: 'Preparing guest session...',
      indeterminate: true,
    });
    try {
      await preloadAllAssets((/** @type {any} */ loaded, /** @type {any} */ total) => {
        showLoadingScreen({
          stage: 'Loading world assets',
          message: `Loading world assets... ${loaded}/${total}`,
          progress: Math.round((loaded / total) * 100),
        });
      });
      showLoadingScreen({
        stage: 'Connecting realm',
        message: 'Opening realm link...',
        indeterminate: true,
      });
      await connection.start({ guest: true }, { manualStepping, virtualNow, onStageChange: updateLoadingFromNetworkStage });
      showEntryBanner({
        title: 'Guest Adventurer',
        subtitle: 'Fighter · Ready for battle',
      });
    } catch {
      uiAudio.play('error');
      hideErrorOverlay();
      showErrorOverlay({
        title: 'Could not connect',
        message: 'Check your network and try again.',
        actions: [
          {
            label: 'Retry',
            onClick: () => {
              hideErrorOverlay();
              window.location.href = `${window.location.pathname}?guest=1`;
            },
          },
          {
            label: 'Back',
            onClick: () => {
              hideErrorOverlay();
              window.location.href = window.location.pathname;
            },
          },
        ],
      });
    } finally {
      hideLoadingScreen();
    }
  })();
} else {
  auth.initFromStorage();
  menu.setAccount(auth.getAccount());
  ui.setMenuOpen(true);
  menu.setOpen(true);
  menu.setProgressStep('account');
  menu.setStatusMessage('Sign in to continue your journey.', 'neutral');
  auth.updateOverlayLabels();
  if (auth.getAccount()) {
    auth.loadCharacters().catch(() => {
      auth.clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      menu.setProgressStep('account');
      menu.setStatusMessage('Session expired. Sign in again.', 'error');
      ui.setStatus('menu');
    });
  } else {
    menu.setStep('auth');
    menu.setTab('signin');
    menu.setProgressStep('account');
    menu.setStatusMessage('Sign in to continue your journey.', 'neutral');
    ui.setStatus('menu');
  }
}
