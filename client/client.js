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
import { getClassById } from '/shared/classes.js';
import { getResourceConfig } from '/shared/economy.js';
import { PLAYER_CONFIG } from '/shared/config.js';
import { createMinimap } from './minimap.js';
import { createChat } from './chat.js';
import { createPauseMenu } from './pause-menu.js';
import { showEntryBanner, hideEntryBanner, showControlsCard, hideControlsCard } from './ui.js';
import { createUiAudio } from './ui-audio.js';
import { buildDebugTextState, installDebugSurface } from './debugSurface.js';
import { createSocialUi } from './social-ui.js';
import { logger } from './logger.js';
import { createLoadingScreen } from './loading.js';

// Ownership boundary: this file composes subsystems; domain logic should stay in focused modules
// (connection/auth/ui-state/combat/input) rather than growing orchestration complexity here.

function installGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('Unhandled error:', message, source, lineno, colno, error);
    showErrorOverlay({
      title: 'Something went wrong',
      message: typeof message === 'string' ? message : 'An unexpected error occurred. Try reloading.',
      actions: [{ label: 'Reload', onClick: () => window.location.reload() }],
    });
    return true;
  };
  window.onunhandledrejection = (event) => {
    logger.error('Unhandled promise rejection:', event.reason);
    showErrorOverlay({
      title: 'Something went wrong',
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
      actions: [{ label: 'Reload', onClick: () => window.location.reload() }],
    });
  };
}
installGlobalErrorHandlers();

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const fpsRowEl = document.querySelector('#hud .hud-fps-row');
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

const { showLoadingScreen, hideLoadingScreen, updateLoadingFromNetworkStage } = createLoadingScreen({
  loadingScreenEl,
  loadingStageEl,
  loadingTextEl,
  loadingTipEl,
  loadingProgressBarEl,
  loadingProgressFillEl,
});

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const DEFAULT_PLAYER_SPEED = PLAYER_CONFIG.speed;
const DEFAULT_WALK_SPEED = PLAYER_CONFIG.speed * (PLAYER_CONFIG.walkSpeedMultiplier ?? 0.6);
const ABILITY_BAR_UPDATE_MS = 100;
const SKILLS_PANEL_UPDATE_MS = 250;
const MINIMAP_UPDATE_MS = 125;

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
 *   latestContracts?: Record<string, any> | null;
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
  latestContracts: null,
};

let /** @type {any} */ nearestVendor = null;
let inVendorRange = false;
let /** @type {any} */ inputHandler = null;
let /** @type {ReturnType<typeof createSocialUi> | null} */ socialUi = null;

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
  const baseMe = gameState.getLocalPlayer();
  const me = baseMe ? { ...baseMe, ...(ctx.latestContracts ?? {}) } : null;
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
  socialUi?.updateUi();
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
  pauseVolumeEl.value = String(Math.round(uiAudio.getVolume() * 100));
  pauseVolumeEl.addEventListener('input', () => {
    const value = Number(pauseVolumeEl.value ?? '100');
    const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 100));
    const volume = normalized / 100;
    uiAudio.setVolume(volume);
    uiAudio.setEnabled(volume > 0);
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
  onContractAccept: (/** @type {any} */ vendorId, /** @type {any} */ contractId) => {
    sendWithSeq({ type: 'contractAccept', vendorId, contractId });
  },
  onContractAbandon: (/** @type {any} */ contractId) => {
    sendWithSeq({ type: 'contractAbandon', contractId });
  },
  onContractTurnIn: (/** @type {any} */ vendorId, /** @type {any} */ contractId) => {
    sendWithSeq({ type: 'contractTurnIn', vendorId, contractId });
  },
  onRepairItem: (/** @type {any} */ fromType, /** @type {any} */ slot) => {
    sendWithSeq({ type: 'repairItem', fromType, slot });
  },
  onSalvageItem: (/** @type {any} */ slot) => {
    sendWithSeq({ type: 'salvageItem', slot });
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
  getPlayerId: () => ctx.playerId,
});
socialUi = createSocialUi({
  ctx,
  gameState,
  ui,
  getConnection: () => connectionRef.current,
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
  onPartyInvite: (/** @type {any} */ invite) => socialUi?.onPartyInvite(invite),
  onDuelRequest: (/** @type {any} */ req) => socialUi?.onDuelRequest(req),
  onDuelActive: () => socialUi?.onDuelActive(),
  onDuelEnded: (/** @type {any} */ reason) => socialUi?.onDuelEnded(reason),
  onDuelDeclined: (/** @type {any} */ data) => {
    ui.showToast?.(`${data.targetName} declined your duel`);
  },
  onTradeRequest: (/** @type {any} */ req) => socialUi?.onTradeRequest(req),
  onTradeOpened: (/** @type {any} */ data) => socialUi?.onTradeOpened(data),
  onTradeOfferUpdate: (/** @type {any} */ data) => socialUi?.onTradeOfferUpdate(data),
  onTradeCompleted: () => socialUi?.onTradeCompleted(),
  onTradeCancelled: () => socialUi?.onTradeCancelled(),
  onTradeDeclined: () => socialUi?.onTradeDeclined(),
  onTradeError: (/** @type {any} */ err) => socialUi?.onTradeError(err),
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
    showControlsCard();
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
  if (fpsRowEl) fpsRowEl.classList.toggle('hidden', !value);
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
setShowFps(getShowFps());

let lastFrameTime = performance.now();
let fpsLastTime = lastFrameTime;
let fpsFrameCount = 0;
let manualStepping = false;
let virtualNow = performance.now();
const deadPlayerIds = new Set();
const harvestingById = new Set();
let lastBodyCursor = '';
let lastCoordsText = '';
let lastPingText = '';
let nextAbilityBarUpdateAt = 0;
let nextSkillsPanelUpdateAt = 0;
let nextMinimapUpdateAt = 0;
let wasSkillsOpen = false;

function dismissOnboardingHints() {
  hideEntryBanner();
  hideControlsCard();
}

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
  onToggleInventory: () => {
    dismissOnboardingHints();
    ui.toggleInventory();
  },
  onToggleCharacter: () => {
    dismissOnboardingHints();
    ui.toggleCharacter();
  },
  onToggleSkills: () => {
    dismissOnboardingHints();
    ui.toggleSkills();
  },
  onToggleFullscreen: () => {
    if (!document.fullscreenElement) {
      renderSystem.renderer.domElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  },
  onInteract: () => {
    dismissOnboardingHints();
    handleInteract();
  },
  onAbility: (/** @type {any} */ slot) => {
    dismissOnboardingHints();
    combat.useAbility(slot);
  },
  onMoveTarget: (/** @type {any} */ pos, /** @type {any} */ opts) => {
    dismissOnboardingHints();
    connection.sendMoveTarget(pos, opts);
  },
  onInputChange: (/** @type {any} */ keys) => {
    connection.sendInput(keys);
    if (keys?.w || keys?.a || keys?.s || keys?.d) {
      dismissOnboardingHints();
    }
  },
  onTargetSelect: (/** @type {any} */ selection) => {
    dismissOnboardingHints();
    combat.selectTarget(selection);
  },
  onCycleTarget: () => {
    dismissOnboardingHints();
    combat.cycleTarget();
  },
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

function getPlayerSpeed(/** @type {any} */ inputKeys = inputHandler?.getKeys?.()) {
  const worldConfig = gameState.getWorldConfig();
  const configSnapshot = gameState.getConfigSnapshot();
  const sprintSpeed =
    worldConfig?.playerSpeed ??
    configSnapshot?.player?.sprintSpeed ??
    configSnapshot?.player?.speed ??
    DEFAULT_PLAYER_SPEED;
  const walkSpeed =
    worldConfig?.playerWalkSpeed ??
    configSnapshot?.player?.walkSpeed ??
    DEFAULT_WALK_SPEED;
  const baseSpeed = inputKeys?.walk ? walkSpeed : sprintSpeed;
  const multiplier = ctx.currentMe?.moveSpeedMultiplier ?? 1;
  return baseSpeed * multiplier;
}

function stepFrame(/** @type {any} */ dt, /** @type {any} */ now) {
  const inputKeys = inputHandler.getKeys();
  const worldConfig = gameState.getWorldConfig();
  const latestPlayers = gameState.getLatestPlayers();
  const latestResources = gameState.getLatestResources();
  const latestMobs = gameState.getLatestMobs();
  const localState = gameState.getLocalPlayer();
  const serverNow = gameState.getServerNow();
  renderSystem.syncPlayerVisuals(latestPlayers, {
    localPlayerId: ctx.playerId ?? null,
    localPlayerState: localState,
  });
  const { positions, localPos: serverLocalPos } = gameState.renderInterpolatedPlayers(now);
  renderSystem.updatePlayerPositions(positions, {
    localPlayerId: ctx.playerId ?? null,
    inputKeys,
    playerStates: latestPlayers,
  });
  if (localState?.dead && serverLocalPos) {
    gameState.resetPrediction(serverLocalPos);
  }

  const canPredict = !localState?.dead;
  const predictedPos = canPredict
    ? gameState.updateLocalPrediction(dt, serverLocalPos, inputKeys, getPlayerSpeed())
    : serverLocalPos;
  const viewPos = predictedPos ?? serverLocalPos;

  if (predictedPos && ctx.playerId) {
    renderSystem.updatePlayerPositions(
      { [ctx.playerId]: predictedPos },
      {
        localPlayerId: ctx.playerId,
        inputKeys,
        playerStates: latestPlayers,
      }
    );
  }

  let coordsText = '--, --, --';
  if (viewPos) {
    const cameraTarget = renderSystem.updateCamera(viewPos, dt);
    if (cameraTarget) renderSystem.updateVisibility(cameraTarget, now);
    coordsText = `${viewPos.x.toFixed(1)}, ${(viewPos.y ?? 0).toFixed(1)}, ${viewPos.z.toFixed(1)}`;
  }
  if (coordsEl && coordsText !== lastCoordsText) {
    coordsEl.textContent = coordsText;
    lastCoordsText = coordsText;
  }

  const interpolatedMobs = gameState.renderInterpolatedMobs(now);
  renderSystem.updateWorldMobs(interpolatedMobs);

  renderSystem.animateWorldMeshes(now, { localViewPos: viewPos ?? null });
  deadPlayerIds.clear();
  harvestingById.clear();
  if (latestPlayers && typeof latestPlayers === 'object') {
    for (const [id, p] of Object.entries(latestPlayers)) {
      if (p?.dead) deadPlayerIds.add(id);
      if (p?.harvesting) harvestingById.add(id);
    }
  }
  if (ctx.playerId && localState?.harvest) {
    harvestingById.add(ctx.playerId);
  }
  renderSystem.updateAnimations(dt, now, {
    deadPlayerIds,
    harvestingById,
    localPlayerId: ctx.playerId ?? null,
    inputKeys,
    playerStates: latestPlayers,
  });
  renderSystem.updateEffects(now);
  const resolvedTarget = resolveTarget(ctx.selectedTarget, {
    mobs: latestMobs,
    players: latestPlayers,
    vendors: worldConfig?.vendors ?? [],
  });
  if (!resolvedTarget && ctx.selectedTarget) {
    ctx.selectedTarget = null;
  }
  if (resolvedTarget?.pos) {
    if (localState && Number.isFinite(localState.x) && Number.isFinite(localState.z)) {
      /** @type {any} */ (resolvedTarget).distance = Math.hypot(
        (resolvedTarget.pos.x ?? 0) - localState.x,
        (resolvedTarget.pos.z ?? 0) - localState.z
      );
    }
    renderSystem.setTargetRing({
      x: resolvedTarget.pos.x,
      y: resolvedTarget.pos.y ?? 0,
      z: resolvedTarget.pos.z,
    });
  } else {
    renderSystem.setTargetRing(null);
  }
  ui.updateTargetHud(resolvedTarget);

  if (now >= nextAbilityBarUpdateAt) {
    ui.updateAbilityBar(
      localState,
      serverNow,
      gameState.getConfigSnapshot()?.combat?.globalCooldownMs ?? 900,
      resolvedTarget
    );
    nextAbilityBarUpdateAt = now + ABILITY_BAR_UPDATE_MS;
  }

  const desiredCursor = combat.getPlacementMode() ? 'crosshair' : '';
  if (desiredCursor !== lastBodyCursor) {
    document.body.style.cursor = desiredCursor;
    lastBodyCursor = desiredCursor;
  }

  const skillsOpen = ui.isSkillsOpen();
  if (skillsOpen && !wasSkillsOpen) {
    nextSkillsPanelUpdateAt = 0;
  }
  if (skillsOpen && now >= nextSkillsPanelUpdateAt) {
    ui.updateSkillsPanel(localState);
    nextSkillsPanelUpdateAt = now + SKILLS_PANEL_UPDATE_MS;
  }
  wasSkillsOpen = skillsOpen;

  nearestVendor = null;
  inVendorRange = false;
  if (viewPos) {
    const { vendor, distance } = getNearestVendor(viewPos);
    const maxDist = worldConfig?.vendorInteractRadius ?? 2.5;
    nearestVendor = vendor;
    if (vendor && distance <= maxDist) {
      inVendorRange = true;
    }
  }

  if (ui.isUiBlocking()) {
    ui.clearPrompt();
  } else if (localState?.harvest) {
    const resourceType = localState.harvest.resourceType ?? 'crystal';
    if (resourceType === 'tree') {
      ui.showPrompt('Chopping Tree...');
    } else {
      const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
      ui.showPrompt(`Harvesting ${itemName}...`);
    }
  } else if (inVendorRange && nearestVendor) {
    ui.showPrompt(`Press E to talk to ${nearestVendor.name ?? 'Vendor'}`);
  } else if (viewPos && latestResources.length) {
    const radius = worldConfig?.harvestRadius ?? 2;
    const invCap =
      localState?.invCap ??
      (worldConfig?.playerInvSlots && worldConfig?.playerInvStackMax
        ? worldConfig.playerInvSlots * worldConfig.playerInvStackMax
        : 5);
    const inv = localState?.inv ?? 0;
    let /** @type {any} */ nearestResource = null;
    let nearestResourceDistSq = Infinity;
    const radiusSq = radius * radius;
    if (!localState?.dead && inv < invCap) {
      for (const resource of latestResources) {
        if (!resource.available) continue;
        const dx = resource.x - viewPos.x;
        const dz = resource.z - viewPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq <= radiusSq && distSq < nearestResourceDistSq) {
          nearestResource = resource;
          nearestResourceDistSq = distSq;
        }
      }
    }
    if (nearestResource) {
      const resourceType = nearestResource.type ?? 'crystal';
      if (resourceType === 'tree') {
        ui.showPrompt('Press E to chop Tree');
      } else {
        const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
        ui.showPrompt(`Press E to harvest ${itemName}`);
      }
    } else {
      ui.clearPrompt();
    }
  } else {
    ui.clearPrompt();
  }

  combat.pruneCombatEvents(serverNow);

  if (pingEl) {
    const ms = ctx.pingMs;
    const pingText = ms != null ? `${ms} ms` : '--';
    if (pingText !== lastPingText) {
      pingEl.textContent = pingText;
      lastPingText = pingText;
    }
  }

  fpsFrameCount += 1;
  if (now - fpsLastTime >= 1000) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastTime);
    if (fpsEl) fpsEl.textContent = fps.toFixed(0);
    fpsFrameCount = 0;
    fpsLastTime = now;
  }

  renderSystem.renderFrame();
  if (now >= nextMinimapUpdateAt) {
    minimap.render({
      playerPos: viewPos,
      mobs: latestMobs,
      resources: latestResources,
      worldConfig,
    });
    nextMinimapUpdateAt = now + MINIMAP_UPDATE_MS;
  }
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
  return buildDebugTextState({
    gameState,
    ui,
    menu,
    auth,
    ctx,
    combat,
    getInputKeys: () => inputHandler?.getKeys?.() ?? null,
    getMovementSpeed: (/** @type {any} */ keys) => getPlayerSpeed(keys),
  });
}

installDebugSurface({
  getTextState: buildTextState,
  connection,
  sendWithSeq,
  combatRef,
  renderSystem,
  combat,
  ui,
  ctx,
  getInputKeys: () => inputHandler?.getKeys?.() ?? null,
});

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
      showControlsCard();
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
