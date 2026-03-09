// @ts-check
import { getResourceConfig } from '/shared/economy.js';

const DEFAULT_VENDOR_INTERACT_RADIUS = 2.5;
const DEFAULT_HARVEST_RADIUS = 2;
const POSITION_EPSILON = 0.35;

function distance2D(/** @type {{ x: number, z: number }} */ a, /** @type {{ x: number, z: number }} */ b) {
  const dx = (a?.x ?? 0) - (b?.x ?? 0);
  const dz = (a?.z ?? 0) - (b?.z ?? 0);
  return Math.hypot(dx, dz);
}

function hasMovedBeyondThreshold(
  /** @type {{ x: number, z: number } | null} */ prev,
  /** @type {{ x: number, z: number } | null} */ next,
  /** @type {number} */ threshold
) {
  if (!prev || !next) return true;
  return distance2D(prev, next) >= threshold;
}

/**
 * Encapsulates nearest-vendor/resource detection and prompt text decisions.
 *
 * @param {{
 *   gameState: any;
 *   ui: any;
 *   connection: any;
 * }} deps
 */
export function createPromptController({ gameState, ui, connection }) {
  /** @type {any | null} */
  let nearestVendor = null;
  let inVendorRange = false;

  /** @type {{ x: number, z: number } | null} */
  let lastVendorSamplePos = null;
  /** @type {any[] | null} */
  let lastVendorsRef = null;
  let lastVendorRadius = DEFAULT_VENDOR_INTERACT_RADIUS;
  /** @type {{ vendor: any | null, distance: number }} */
  let lastVendorResult = { vendor: null, distance: Infinity };

  /** @type {{ x: number, z: number } | null} */
  let lastResourceSamplePos = null;
  /** @type {any[] | null} */
  let lastResourcesRef = null;
  let lastHarvestRadius = DEFAULT_HARVEST_RADIUS;
  /** @type {{ resource: any | null, distanceSq: number }} */
  let lastResourceResult = { resource: null, distanceSq: Infinity };

  function resetVendorState() {
    nearestVendor = null;
    inVendorRange = false;
  }

  /**
   * Find the nearest vendor to the given position in the provided list.
   *
   * @param {{ x: number, z: number } | null} pos
   * @param {any[] | null} vendors
   */
  function findNearestVendor(pos, vendors) {
    if (!pos || !Array.isArray(vendors) || vendors.length === 0) {
      return { vendor: null, distance: Infinity };
    }
    /** @type {any | null} */
    let bestVendor = null;
    let bestDist = Infinity;
    for (const vendor of vendors) {
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

  /**
   * Cached nearest-vendor query that only re-scans vendors when the player
   * has moved a meaningful distance or the vendor list/radius changed.
   *
   * @param {{ x: number, z: number } | null} pos
   * @param {any} worldConfig
   */
  function getNearestVendor(pos, worldConfig) {
    const vendors = Array.isArray(worldConfig?.vendors) ? worldConfig.vendors : null;
    const radius =
      typeof worldConfig?.vendorInteractRadius === 'number' && Number.isFinite(worldConfig.vendorInteractRadius)
        ? worldConfig.vendorInteractRadius
        : DEFAULT_VENDOR_INTERACT_RADIUS;

    if (
      pos &&
      vendors === lastVendorsRef &&
      radius === lastVendorRadius &&
      !hasMovedBeyondThreshold(lastVendorSamplePos, pos, POSITION_EPSILON)
    ) {
      return lastVendorResult;
    }

    const basePos = pos ? { x: pos.x, z: pos.z } : null;
    const nextResult = basePos && vendors ? findNearestVendor(basePos, vendors) : { vendor: null, distance: Infinity };

    lastVendorSamplePos = basePos;
    lastVendorsRef = vendors;
    lastVendorRadius = radius;
    lastVendorResult = nextResult;
    return nextResult;
  }

  /**
   * Cached nearest-resource query with simple position/list-based invalidation.
   *
   * @param {{ x: number, z: number } | null} viewPos
   * @param {any[]} latestResources
   * @param {number} radius
   * @param {boolean} canHarvest
   */
  function getNearestResource(viewPos, latestResources, radius, canHarvest) {
    if (!viewPos || !canHarvest || !Array.isArray(latestResources) || latestResources.length === 0) {
      return null;
    }

    if (
      latestResources === lastResourcesRef &&
      radius === lastHarvestRadius &&
      !hasMovedBeyondThreshold(lastResourceSamplePos, viewPos, POSITION_EPSILON)
    ) {
      return lastResourceResult.resource;
    }

    const radiusSq = radius * radius;
    /** @type {any | null} */
    let nearestResource = null;
    let nearestResourceDistSq = Infinity;

    for (const resource of latestResources) {
      if (!resource?.available) continue;
      const dx = resource.x - viewPos.x;
      const dz = resource.z - viewPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= radiusSq && distSq < nearestResourceDistSq) {
        nearestResource = resource;
        nearestResourceDistSq = distSq;
      }
    }

    lastResourceSamplePos = { x: viewPos.x, z: viewPos.z };
    lastResourcesRef = latestResources;
    lastHarvestRadius = radius;
    lastResourceResult = { resource: nearestResource, distanceSq: nearestResourceDistSq };

    return nearestResource;
  }

  /**
   * Update prompts and nearest-entity state for the current frame.
   *
   * @param {{
   *   viewPos: any;
   *   localState: any;
   *   latestResources: any[];
   *   worldConfig: any;
   * }} params
   */
  function updatePrompts({ viewPos, localState, latestResources, worldConfig }) {
    resetVendorState();

    if (ui.isUiBlocking()) {
      ui.clearPrompt();
      return;
    }

    if (localState?.harvest) {
      const resourceType = localState.harvest.resourceType ?? 'crystal';
      if (resourceType === 'tree') {
        ui.showPrompt('Chopping Tree...');
      } else {
        const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
        ui.showPrompt(`Harvesting ${itemName}...`);
      }
      return;
    }

    if (viewPos) {
      const { vendor, distance } = getNearestVendor(viewPos, worldConfig);
      const maxDist =
        typeof worldConfig?.vendorInteractRadius === 'number' && Number.isFinite(worldConfig.vendorInteractRadius)
          ? worldConfig.vendorInteractRadius
          : DEFAULT_VENDOR_INTERACT_RADIUS;
      nearestVendor = vendor;
      if (vendor && distance <= maxDist) {
        inVendorRange = true;
      }
    }

    if (inVendorRange && nearestVendor) {
      ui.showPrompt(`Press E to talk to ${nearestVendor.name ?? 'Vendor'}`);
      return;
    }

    if (viewPos && latestResources.length) {
      const radius =
        typeof worldConfig?.harvestRadius === 'number' && Number.isFinite(worldConfig.harvestRadius)
          ? worldConfig.harvestRadius
          : DEFAULT_HARVEST_RADIUS;
      const invCap =
        localState?.invCap ??
        (worldConfig?.playerInvSlots && worldConfig?.playerInvStackMax
          ? worldConfig.playerInvSlots * worldConfig.playerInvStackMax
          : 5);
      const inv = localState?.inv ?? 0;
      const canHarvest = !localState?.dead && inv < invCap;
      const nearestResource = getNearestResource(viewPos, latestResources, radius, canHarvest);
      if (nearestResource) {
        const resourceType = nearestResource.type ?? 'crystal';
        if (resourceType === 'tree') {
          ui.showPrompt('Press E to chop Tree');
        } else {
          const itemName = getResourceConfig(resourceType).itemName ?? 'Resource';
          ui.showPrompt(`Press E to harvest ${itemName}`);
        }
        return;
      }
    }

    ui.clearPrompt();
  }

  /**
   * Handle interact key presses based on current vendor state and UI.
   */
  function handleInteract() {
    if (ui.isTradeOpen()) return;
    if (ui.isDialogOpen() && ui.vendorUI) {
      ui.vendorUI.openTrade();
      return;
    }
    if (ui.isInventoryOpen()) return;

    const me = gameState.getLocalPlayer();
    const pos = me ? { x: me.x, y: me.y ?? 0, z: me.z } : null;
    const worldConfig = gameState.getWorldConfig();
    const { vendor, distance } = pos ? getNearestVendor(pos, worldConfig) : { vendor: null, distance: Infinity };
    const maxDist =
      typeof worldConfig?.vendorInteractRadius === 'number' && Number.isFinite(worldConfig.vendorInteractRadius)
        ? worldConfig.vendorInteractRadius
        : DEFAULT_VENDOR_INTERACT_RADIUS;
    const targetVendor = vendor ?? nearestVendor;
    const inRange = vendor ? distance <= maxDist : inVendorRange;
    if (inRange && targetVendor && ui.vendorUI) {
      ui.vendorUI.openDialog(targetVendor);
      ui.clearPrompt();
      return;
    }
    connection.sendInteract();
  }

  return {
    updatePrompts,
    handleInteract,
  };
}

