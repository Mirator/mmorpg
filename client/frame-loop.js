// @ts-check
import { resolveTarget } from './targeting.js';

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const ABILITY_BAR_UPDATE_MS = 100;
const SKILLS_PANEL_UPDATE_MS = 250;
const MINIMAP_UPDATE_MS = 125;

/**
 * Create the main game frame loop and interpolation logic.
 *
 * @param {{
 *   gameState: any;
 *   renderSystem: any;
 *   minimap: any;
 *   ui: any;
 *   combat: any;
 *   ctx: any;
 *   getInputKeys: () => any;
 *   getPlayerSpeed: (keys?: any) => number;
 *   updatePrompts: (params: {
 *     viewPos: any;
 *     localState: any;
 *     latestResources: any[];
 *     worldConfig: any;
 *   }) => void;
 *   getPingMs: () => number | null;
 *   getWorldConfig: () => any;
 *   getConfigSnapshot: () => any;
 *   getLatestPlayers: () => any;
 *   getLatestResources: () => any[];
 *   getLatestMobs: () => any[];
 *   getLocalPlayer: () => any;
 *   getServerNow: () => number;
 * }} deps
 */
export function createFrameLoop({
  gameState,
  renderSystem,
  minimap,
  ui,
  combat,
  ctx,
  getInputKeys,
  getPlayerSpeed,
  updatePrompts,
  getPingMs,
  getWorldConfig,
  getConfigSnapshot,
  getLatestPlayers,
  getLatestResources,
  getLatestMobs,
  getLocalPlayer,
  getServerNow,
}) {
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

  const appCoordsEl = /** @type {HTMLElement | null} */ (document.getElementById('coords'));
  const pingEl = /** @type {HTMLElement | null} */ (document.getElementById('ping-ms'));
  const fpsEl = /** @type {HTMLElement | null} */ (document.getElementById('fps'));

  /**
   * Advance a single rendered frame.
   *
   * @param {number} dt - Delta time in seconds.
   * @param {number} now - High-resolution timestamp in milliseconds.
   */
  function updateFrame(dt, now) {
    const inputKeys = getInputKeys();
    const worldConfig = getWorldConfig();
    const latestPlayers = getLatestPlayers();
    const latestResources = getLatestResources();
    const latestMobs = getLatestMobs();
    const localState = getLocalPlayer();
    const serverNow = getServerNow();

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
      ? gameState.updateLocalPrediction(dt, serverLocalPos, inputKeys, getPlayerSpeed(inputKeys))
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
    if (appCoordsEl && coordsText !== lastCoordsText) {
      appCoordsEl.textContent = coordsText;
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
      const configSnapshot = getConfigSnapshot();
      ui.updateAbilityBar(
        localState,
        serverNow,
        configSnapshot?.combat?.globalCooldownMs ?? 900,
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

    updatePrompts({
      viewPos,
      localState,
      latestResources,
      worldConfig,
    });

    combat.pruneCombatEvents(serverNow);

    if (pingEl) {
      const ms = getPingMs();
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
    updateFrame(dt, now);
    requestAnimationFrame(animate);
  }

  function start() {
    if (renderSystem.isWebGLReady()) {
      animate();
    }
  }

  /**
   * Advance the simulation by a given number of milliseconds (test support).
   *
   * @param {number} ms
   */
  function advanceTime(ms) {
    manualStepping = true;
    const stepMs = 1000 / 60;
    const steps = Math.max(1, Math.round(ms / stepMs));
    for (let i = 0; i < steps; i += 1) {
      virtualNow += stepMs;
      updateFrame(stepMs / 1000, virtualNow);
    }
    return Promise.resolve();
  }

  function handleResize() {
    renderSystem.resize();
    minimap.resize();
  }

  return {
    start,
    advanceTime,
    handleResize,
    INTERP_DELAY_MS,
    MAX_SNAPSHOT_AGE_MS,
    MAX_SNAPSHOTS,
  };
}

