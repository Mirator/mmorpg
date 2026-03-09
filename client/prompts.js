// @ts-check
import { getResourceConfig } from '/shared/economy.js';

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

  function resetVendorState() {
    nearestVendor = null;
    inVendorRange = false;
  }

  /**
   * Find the nearest vendor to the given position.
   *
   * @param {any} pos
   */
  function getNearestVendor(pos) {
    const worldConfig = gameState.getWorldConfig();
    if (!pos || !Array.isArray(worldConfig?.vendors)) {
      return { vendor: null, distance: Infinity };
    }
    /** @type {any | null} */
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
      const { vendor, distance } = getNearestVendor(viewPos);
      const maxDist = worldConfig?.vendorInteractRadius ?? 2.5;
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
      const radius = worldConfig?.harvestRadius ?? 2;
      const invCap =
        localState?.invCap ??
        (worldConfig?.playerInvSlots && worldConfig?.playerInvStackMax
          ? worldConfig.playerInvSlots * worldConfig.playerInvStackMax
          : 5);
      const inv = localState?.inv ?? 0;
      /** @type {any | null} */
      let nearestResource = null;
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

  return {
    updatePrompts,
    handleInteract,
  };
}

