// @ts-check
import { showErrorOverlay } from './error-overlay.js';
import { createRenderSystem } from './render.js';
import { createGameState } from './state.js';
import { createInputHandler } from './input.js';
import { createUiState } from './ui-state.js';
import { createConnection } from './connection.js';
import { createCombat } from './combat.js';
import { getClassById } from '/shared/classes.js';
import { PLAYER_CONFIG } from '/shared/config.js';
import { createMinimap } from './minimap.js';
import { createChat } from './chat.js';
import { createPauseMenu } from './pause-menu.js';
import { showEntryBanner, hideEntryBanner, showControlsCard, hideControlsCard } from './ui.js';
import { logger } from './logger.js';
import { createPromptController } from './prompts.js';
import { createFrameLoop } from './frame-loop.js';
import { createOverlays } from './overlays.js';
import { setupSocialAndDebug } from './social-wiring.js';
import { createAssetWarmup } from './assetWarmup.js';
import { buildWarmupTiers } from './assetWarmupTasks.js';
import { buildCatalogWarmupPlan, buildSceneWarmupPlan } from './sceneWarmup.js';

let globalErrorHandlersInstalled = false;

function installGlobalErrorHandlers() {
  if (globalErrorHandlersInstalled) return;
  globalErrorHandlersInstalled = true;

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

const DEFAULT_PLAYER_SPEED = PLAYER_CONFIG.speed;
const DEFAULT_WALK_SPEED = PLAYER_CONFIG.speed * (PLAYER_CONFIG.walkSpeedMultiplier ?? 0.6);
const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const FPS_STORAGE_KEY = 'mmorpg_show_fps';

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

function getShowFps() {
  try {
    return localStorage.getItem(FPS_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** @param {any} value */
function setShowFpsPreference(value) {
  try {
    localStorage.setItem(FPS_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   app: HTMLElement | null;
 *   menu: any;
 *   auth: any;
 *   uiBridge: any;
 *   uiAudio: any;
 *   loading: {
 *     showLoadingScreen: (options?: any) => void;
 *     hideLoadingScreen: () => void;
 *     updateLoadingFromNetworkStage: (stage: string) => void;
 *   };
 *   isGuestSession: boolean;
 *   overlayEl: HTMLElement | null;
 * }} options
 */
export function loadGameRuntime({
  app,
  menu,
  auth,
  uiBridge,
  uiAudio,
  loading,
  isGuestSession,
  overlayEl,
}) {
  installGlobalErrorHandlers();

  const fpsRowEl = document.querySelector('#hud .hud-fps-row');
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

  /** @type {{ current: any | null }} */
  const connectionRef = { current: null };
  /** @type {{ current: any | null }} */
  const combatRef = { current: null };

  let /** @type {any} */ inputHandler = null;
  let /** @type {any} */ socialUi = null;
  let runtimeDisposed = false;

  const assetWarmup = createAssetWarmup({
    maxConcurrency: 3,
    onError: (/** @type {any} */ error, /** @type {any} */ task) => {
      console.warn('[asset-warmup] Failed task', task?.key, error);
    },
  });

  function queueSessionWarmup() {
    const scenePlan = buildSceneWarmupPlan({
      worldConfig: gameState.getWorldConfig(),
      localPlayer: gameState.getLocalPlayer(),
      publicPlayers: gameState.getLatestPlayers(),
      mobs: gameState.getLatestMobs(),
      resources: gameState.getLatestResources(),
    });
    assetWarmup.startSession(
      buildWarmupTiers({
        scenePlan,
        catalogPlan: buildCatalogWarmupPlan(),
      })
    );
  }

  function sendWithSeq(/** @type {any} */ msg) {
    ctx.seq += 1;
    ctx.net?.send?.({ ...msg, seq: ctx.seq });
  }

  function setWorld(/** @type {any} */ config) {
    const worldConfig = config ?? null;
    gameState.setWorldConfig(worldConfig);
    renderSystem.updateWorld(worldConfig);
  }

  let /** @type {any} */ ui = null;

  function updateLocalUi() {
    if (!ui) return;
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
    socialUi?.updateUi?.();
  }

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

  ui = createUiState({
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
  uiBridge.attachRuntime(ui);

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
    onStageChange: loading.updateLoadingFromNetworkStage,
  });
  connectionRef.current = connection;

  if (fpsRowEl) fpsRowEl.classList.toggle('hidden', !getShowFps());

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
    setShowFps: (/** @type {any} */ value) => {
      setShowFpsPreference(value);
      if (fpsRowEl) fpsRowEl.classList.toggle('hidden', !value);
    },
  });

  const { dismissOnboardingHints, showCharacterEntry, showGuestEntry } = createOverlays({
    showEntryBanner,
    hideEntryBanner,
    showControlsCard,
    hideControlsCard,
    overlayEl,
  });

  const promptController = createPromptController({
    gameState,
    ui,
    connection,
  });

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
      promptController.handleInteract();
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

  const socialSetup = setupSocialAndDebug({
    ctx,
    gameState,
    ui,
    getConnection: () => connectionRef.current,
    menu,
    auth,
    combat,
    renderSystem,
    getInputKeys: () => inputHandler?.getKeys?.() ?? null,
    getPlayerSpeed,
    connection,
    sendWithSeq,
  });
  socialUi = socialSetup.socialUi;

  const frameLoop = createFrameLoop({
    gameState,
    renderSystem,
    minimap,
    ui,
    combat,
    ctx,
    getInputKeys: () => inputHandler?.getKeys?.() ?? null,
    getPlayerSpeed,
    updatePrompts: (/** @type {any} */ params) => promptController.updatePrompts(params),
    getPingMs: () => ctx.pingMs,
    getWorldConfig: () => gameState.getWorldConfig(),
    getConfigSnapshot: () => gameState.getConfigSnapshot(),
    getLatestPlayers: () => gameState.getLatestPlayers(),
    getLatestResources: () => gameState.getLatestResources(),
    getLatestMobs: () => gameState.getLatestMobs(),
    getLocalPlayer: () => gameState.getLocalPlayer(),
    getServerNow: () => gameState.getServerNow(),
  });

  window.addEventListener('resize', handleResize);
  frameLoop.handleResize();

  if (renderSystem.isWebGLReady()) {
    frameLoop.start();
  }

  // Expose manual stepping for tests once the runtime exists.
  window.advanceTime = (/** @type {any} */ ms) => frameLoop.advanceTime(ms);

  function handleResize() {
    frameLoop.handleResize();
  }

  function disconnect() {
    assetWarmup.cancelSession();
    connection.disconnect();
  }

  /**
   * @param {{ character?: any, guest?: boolean }} [options]
   */
  async function startSession({ character = null, guest = false } = {}) {
    loading.showLoadingScreen({
      stage: 'Connecting realm',
      message: 'Opening realm link...',
      indeterminate: true,
    });
    assetWarmup.cancelSession();
    await connection.start(
      guest ? { guest: true } : { character },
      { manualStepping: false, virtualNow: performance.now(), onStageChange: loading.updateLoadingFromNetworkStage }
    );
    queueSessionWarmup();
    loading.showLoadingScreen({
      stage: 'Syncing world state',
      message: guest ? 'Spawning guest session...' : 'Spawning your character...',
      progress: 100,
    });
    if (guest) {
      showGuestEntry();
    } else {
      showCharacterEntry(character, getClassById(character?.classId));
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }

  function dispose() {
    if (runtimeDisposed) return;
    runtimeDisposed = true;
    disconnect();
    assetWarmup.cancelSession();
    window.removeEventListener('resize', handleResize);
    uiBridge.detachRuntime();
    ui?.dispose?.();
  }

  return {
    ui,
    startSession,
    disconnect,
    dispose,
  };
}
