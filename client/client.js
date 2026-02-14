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
import { getAbilitiesForClass } from '/shared/classes.js';
import { splitCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { PLAYER_CONFIG } from '/shared/config.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { createMinimap } from './minimap.js';
import { createChat } from './chat.js';

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');
const accountNameEl = document.getElementById('account-name');
const characterNameEl = document.getElementById('overlay-character-name');
const signOutBtn = document.getElementById('signout-btn');
const overlayEl = document.getElementById('overlay');
const loadingScreenEl = document.getElementById('loading-screen');
const loadingTextEl = document.getElementById('loading-text');

function showLoadingScreen(text = 'Loading...') {
  if (loadingTextEl) loadingTextEl.textContent = text;
  loadingScreenEl?.classList.add('visible');
}

function hideLoadingScreen() {
  loadingScreenEl?.classList.remove('visible');
}

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const DEFAULT_PLAYER_SPEED = PLAYER_CONFIG.speed;

const renderSystem = createRenderSystem({ app });
const minimap = createMinimap(document.getElementById('minimap-container'));
const gameState = createGameState({
  interpDelayMs: INTERP_DELAY_MS,
  maxSnapshots: MAX_SNAPSHOTS,
  maxSnapshotAgeMs: MAX_SNAPSHOT_AGE_MS,
});

const ctx = {
  seq: 0,
  net: null,
  closingNet: null,
  playerId: null,
  currentMe: null,
  selectedTarget: null,
};

let nearestVendor = null;
let inVendorRange = false;
let inputHandler = null;

function sendWithSeq(msg) {
  ctx.seq += 1;
  ctx.net?.send?.({ ...msg, seq: ctx.seq });
}

function setWorld(config) {
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
}

const authRef = { current: null };
const connectionRef = { current: null };
const combatRef = { current: null };

const chat = createChat({
  onSend: (channel, text) => {
    sendWithSeq({ type: 'chat', channel, text });
  },
  isInParty: () => !!ctx.currentMe?.partyId,
});

const ui = createUiState({
  onInventorySwap: (from, to) => {
    sendWithSeq({ type: 'inventorySwap', from, to });
  },
  onEquipmentSwap: ({ fromType, fromSlot, toType, toSlot }) => {
    sendWithSeq({ type: 'equipSwap', fromType, fromSlot, toType, toSlot });
  },
  onVendorSell: (slot, vendorId) => {
    sendWithSeq({ type: 'vendorSell', slot, vendorId });
  },
  onAbilityClick: (slot) => {
    combatRef.current?.useAbility(slot);
  },
  onUiOpen: () => {
    inputHandler?.clearMovement();
  },
  onRespawn: () => {
    connectionRef.current?.sendRespawn();
  },
  isChatFocused: () => chat.isChatFocused(),
});

const menu = createMenu({
  onSignIn: (data) => authRef.current?.signIn(data),
  onSignUp: (data) => authRef.current?.signUp(data),
  onSelectCharacter: (char) => authRef.current?.connectCharacter(char),
  onCreateCharacter: (data) => authRef.current?.createCharacter(data),
  onDeleteCharacter: (char) => authRef.current?.deleteCharacter(char),
  onSignOut: () => authRef.current?.signOut(),
});

const auth = createAuth({
  menu,
  ui,
  accountNameEl,
  characterNameEl,
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

let pendingPartyInvite = null;

const connection = createConnection({
  gameState,
  renderSystem,
  ui,
  ctx,
  onCombatEvents: (event, now, eventTime) =>
    combat.handleCombatEvent(event, now, eventTime),
  onAbilityFailed: (reason, slot) => ui.showAbilityError(reason, slot),
  onChatMessage: (data) => {
    const channel = data?.channel ?? 'area';
    chat.addMessage(channel, data);
  },
  onCombatLog: (entries) => chat.addCombatLogEntries(entries),
  onConnected: () => chat.addSystemMessage('Connected to game'),
  onPartyInvite: (invite) => {
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
  updateLocalUi,
  setWorld,
  loadCharacters: () => auth.loadCharacters(),
  clearSessionState: () => auth.clearSessionState(),
  menu,
  getReconnectParams: () =>
    isGuestSession ? { guest: true } : { character: auth.getCharacter() },
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
  if (statusEl) {
    statusEl.style.display = inParty ? 'block' : 'none';
  }
  if (leaveBtn) {
    leaveBtn.style.display = inParty ? 'inline-block' : 'none';
  }
  if (inviteBtn) {
    inviteBtn.style.display = hasPlayerTarget ? 'inline-block' : 'none';
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

auth.setOnConnectCharacter(async (character) => {
  showLoadingScreen('Loading assets...');
  try {
    await preloadAllAssets();
    showLoadingScreen('Connecting...');
    await connection.start({ character }, { manualStepping, virtualNow });
  } finally {
    hideLoadingScreen();
  }
});
auth.setOnDisconnect(() => connection.disconnect());

const urlParams = new URLSearchParams(window.location.search);
const isGuestSession = urlParams.get('guest') === '1';

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
  isDialogOpen: ui.isDialogOpen,
  isTradeOpen: ui.isTradeOpen,
  isInventoryOpen: ui.isInventoryOpen,
  isSkillsOpen: ui.isSkillsOpen,
  onToggleInventory: ui.toggleInventory,
  onToggleCharacter: ui.toggleCharacter,
  onToggleSkills: ui.toggleSkills,
  onInteract: handleInteract,
  onAbility: (slot) => combat.useAbility(slot),
  onMoveTarget: (pos, opts) => connection.sendMoveTarget(pos, opts),
  onInputChange: connection.sendInput,
  onTargetSelect: combat.selectTarget,
  onCycleTarget: combat.cycleTarget,
  pickTarget: (ndc) => renderSystem.pickTarget(ndc),
  onTradeTab: (tab) => ui.vendorUI?.setTab?.(tab),
  getPlacementMode: () => combat.getPlacementMode(),
  onPlacementConfirm: (pos) => combat.confirmPlacement(pos),
  onPlacementCancel: () => combat.cancelPlacement(),
  onPlacementUpdate: (pos) => combat.updatePlacementCursor(pos),
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

function stepFrame(dt, now) {
  const { positions, localPos: serverLocalPos } = gameState.renderInterpolatedPlayers(now);
  renderSystem.updatePlayerPositions(positions, {
    localPlayerId: ctx.playerId ?? null,
    inputKeys: inputHandler.getKeys(),
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
      { localPlayerId: ctx.playerId, inputKeys: inputHandler.getKeys() }
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

  renderSystem.animateWorldMeshes(now);
  const players = gameState.getLatestPlayers();
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
    let near = false;
    if (!localState?.dead && inv < invCap) {
      for (const resource of gameState.getLatestResources()) {
        if (!resource.available) continue;
        const dx = resource.x - viewPos.x;
        const dz = resource.z - viewPos.z;
        if (dx * dx + dz * dz <= radius * radius) {
          near = true;
          break;
        }
      }
    }
    if (near) {
      ui.showPrompt('Press E to harvest');
    } else {
      ui.clearPrompt();
    }
  } else {
    ui.clearPrompt();
  }

  combat.pruneCombatEvents(gameState.getServerNow());

  fpsFrameCount += 1;
  if (now - fpsLastTime >= 1000) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastTime);
    if (fpsEl) {
      fpsEl.textContent = fps.toFixed(0);
    }
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

window.advanceTime = (ms) => {
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
      obstacles: obstacles.map((o) => ({ x: o.x, z: o.z, r: o.r })),
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
    abilities: abilities.map((ability) => ({
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
        .filter((event) => event.attackerId === ctx.playerId)
        .map((event) => ({
          kind: event.kind ?? null,
          attackType: event.attackType ?? null,
          attackerId: event.attackerId ?? null,
          targetId: event.targetId ?? null,
          from: event.from ?? null,
          to: event.to ?? null,
          hit: !!event.hit,
          durationMs: event.durationMs ?? 0,
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
        .map((item, index) =>
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
    resources: gameState.getLatestResources().map((r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
      available: r.available,
      respawnAt: r.respawnAt ?? 0,
    })),
    mobs: gameState.getLatestMobs().map((m) => ({
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
  moveTo: (x, z) => {
    connection.sendMoveTarget({ x, z });
  },
  clearInput: () => {
    connection.sendInput({ w: false, a: false, s: false, d: false });
  },
  interact: () => {
    connection.sendInteract();
  },
  projectToScreen: (x, z) => {
    return renderSystem.projectToScreen({ x, z });
  },
  getState: () => buildTextState(),
  selectTarget: (selection) => {
    combat.selectTarget(selection);
  },
};

function getNearestVendor(pos) {
  const worldConfig = gameState.getWorldConfig();
  if (!pos || !Array.isArray(worldConfig?.vendors)) {
    return { vendor: null, distance: Infinity };
  }
  let bestVendor = null;
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

if (signOutBtn) {
  signOutBtn.addEventListener('click', () => {
    auth.signOut();
  });
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
    showLoadingScreen('Loading assets...');
    try {
      await preloadAllAssets();
      showLoadingScreen('Connecting...');
      await connection.start({ guest: true }, { manualStepping, virtualNow });
    } catch {
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
  auth.updateOverlayLabels();
  if (auth.getAccount()) {
    auth.loadCharacters().catch(() => {
      auth.clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      ui.setStatus('menu');
    });
  } else {
    menu.setStep('auth');
    menu.setTab('signin');
    ui.setStatus('menu');
  }
}
