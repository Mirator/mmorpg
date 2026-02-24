// @ts-check
import { addItem, canAddItem, countInventory } from './inventory.js';
import { getResourceConfig, getResourceRespawnMs } from '../../shared/economy.js';

function distance2(/** @type {any} */ a, /** @type {any} */ b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function findClosestAvailableResource(
  /** @type {any} */ resources,
  /** @type {any} */ playerPos,
  /** @type {any} */ harvestRadius
) {
  let /** @type {any} */ closest = null;
  let closestDist2 = harvestRadius * harvestRadius;
  for (const resource of resources) {
    if (!resource.available) continue;
    const dist2 = distance2({ x: resource.x, z: resource.z }, playerPos);
    if (dist2 <= closestDist2) {
      closest = resource;
      closestDist2 = dist2;
    }
  }
  return closest;
}

function createHarvestItem(/** @type {any} */ now, /** @type {any} */ itemKind, /** @type {any} */ itemName, /** @type {any} */ config = {}) {
  const makeItem =
    config.makeItem ??
    (() => ({
      id: `item-${now}-${Math.random().toString(16).slice(2)}`,
      kind: itemKind,
      name: itemName,
      count: 1,
    }));
  return makeItem();
}

export function createResources(/** @type {any} */ nodes) {
  return nodes.map((/** @type {any} */ node) => ({
    id: node.id,
    x: node.x,
    y: node.y ?? 0,
    z: node.z,
    type: node.type ?? 'crystal',
    respawnMs: node.respawnMs,
    available: true,
    respawnAt: 0,
  }));
}

export function stepResources(/** @type {any} */ resources, /** @type {any} */ now) {
  for (const resource of resources) {
    if (!resource.available && resource.respawnAt <= now) {
      resource.available = true;
      resource.respawnAt = 0;
    }
  }
}

export function clearHarvest(/** @type {any} */ player) {
  if (!player) return;
  player.harvest = null;
}

export function tryStartHarvest(/** @type {any} */ resources, /** @type {any} */ player, /** @type {any} */ now, /** @type {any} */ config) {
  if (!player || player.dead || !player.pos) return null;
  if (!Array.isArray(resources) || resources.length === 0) return null;
  if (player.harvest && Number.isFinite(player.harvest.endsAt) && player.harvest.endsAt > now) {
    return player.harvest;
  }

  const harvestRadius = config.harvestRadius ?? 2;
  const stackMax = config.stackMax ?? player.invStackMax ?? 20;
  const harvestDurationMs = config.harvestDurationMs ?? 2_500;
  const closest = findClosestAvailableResource(resources, player.pos, harvestRadius);
  if (!closest) return null;

  const resourceType = closest.type ?? config.resourceType ?? 'crystal';
  const resourceConfig = getResourceConfig(resourceType);
  const itemKind = config.itemKind ?? resourceConfig.itemKind;
  if (!player.inventory || !canAddItem(player.inventory, itemKind, stackMax)) {
    return null;
  }

  const hpAtStart = Number.isFinite(player.hp) ? player.hp : 0;
  player.harvest = {
    resourceId: closest.id,
    resourceType,
    startedAt: now,
    endsAt: now + harvestDurationMs,
    hpAtStart,
  };
  return player.harvest;
}

export function stepPlayerHarvest(/** @type {any} */ resources, /** @type {any} */ player, /** @type {any} */ now, /** @type {any} */ config) {
  const harvest = player?.harvest;
  if (!harvest) return null;

  const harvestRadius = config.harvestRadius ?? 2;
  const respawnMs = config.respawnMs ?? 15_000;
  const stackMax = config.stackMax ?? player.invStackMax ?? 20;
  const hpNow = Number.isFinite(player.hp) ? player.hp : 0;

  if (player.dead || !player.pos) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'dead' };
  }
  if (player.movedThisTick) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'moved' };
  }
  if (Number.isFinite(harvest.hpAtStart) && hpNow < harvest.hpAtStart) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'damaged' };
  }

  const resource = resources.find((/** @type {any} */ r) => r.id === harvest.resourceId) ?? null;
  if (!resource || !resource.available) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'resource_missing' };
  }

  const dist2 = distance2({ x: resource.x, z: resource.z }, player.pos);
  if (dist2 > harvestRadius * harvestRadius) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'out_of_range' };
  }

  const resourceType = resource.type ?? harvest.resourceType ?? config.resourceType ?? 'crystal';
  const resourceConfig = getResourceConfig(resourceType);
  const itemKind = config.itemKind ?? resourceConfig.itemKind;
  const itemName = config.itemName ?? resourceConfig.itemName;
  if (!player.inventory || !canAddItem(player.inventory, itemKind, stackMax)) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'inventory_full' };
  }

  if (now < (harvest.endsAt ?? 0)) {
    return { status: 'in_progress' };
  }

  const item = createHarvestItem(now, itemKind, itemName, config);
  if (!addItem(player.inventory, item, stackMax)) {
    clearHarvest(player);
    return { status: 'cancelled', reason: 'inventory_full' };
  }

  const respawnMsForNode = resource.respawnMs ?? getResourceRespawnMs(resourceType, respawnMs);
  resource.available = false;
  resource.respawnAt = now + respawnMsForNode;
  player.inv = countInventory(player.inventory);
  clearHarvest(player);
  return { status: 'completed', harvested: resource };
}

export function tryHarvest(/** @type {any} */ resources, /** @type {any} */ player, /** @type {any} */ now, /** @type {any} */ config) {
  const harvestRadius = config.harvestRadius ?? 2;
  const respawnMs = config.respawnMs ?? 15_000;
  const stackMax = config.stackMax ?? player.invStackMax ?? 20;

  const closest = findClosestAvailableResource(resources, player.pos, harvestRadius);

  if (!closest) return null;

  const resourceType = closest.type ?? config.resourceType ?? 'crystal';
  const resourceConfig = getResourceConfig(resourceType);
  const itemKind = config.itemKind ?? resourceConfig.itemKind;
  const itemName = config.itemName ?? resourceConfig.itemName;
  if (!player.inventory || !canAddItem(player.inventory, itemKind, stackMax)) {
    return null;
  }

  const item = createHarvestItem(now, itemKind, itemName, config);
  if (!addItem(player.inventory, item, stackMax)) return null;

  const respawnMsForNode = closest.respawnMs ?? getResourceRespawnMs(resourceType, respawnMs);
  closest.available = false;
  closest.respawnAt = now + respawnMsForNode;
  player.inv = countInventory(player.inventory);
  return closest;
}
