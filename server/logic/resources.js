import { addItem, canAddItem, countInventory } from './inventory.js';
import { getResourceConfig, getResourceRespawnMs } from '../../shared/economy.js';

function distance2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

export function createResources(nodes) {
  return nodes.map((node) => ({
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

export function stepResources(resources, now) {
  for (const resource of resources) {
    if (!resource.available && resource.respawnAt <= now) {
      resource.available = true;
      resource.respawnAt = 0;
    }
  }
}

export function tryHarvest(resources, player, now, config) {
  const harvestRadius = config.harvestRadius ?? 2;
  const respawnMs = config.respawnMs ?? 15_000;
  const stackMax = config.stackMax ?? player.invStackMax ?? 20;

  let closest = null;
  let closestDist2 = harvestRadius * harvestRadius;

  for (const resource of resources) {
    if (!resource.available) continue;
    const dist2 = distance2({ x: resource.x, z: resource.z }, player.pos);
    if (dist2 <= closestDist2) {
      closest = resource;
      closestDist2 = dist2;
    }
  }

  if (!closest) return null;

  const resourceType = closest.type ?? config.resourceType ?? 'crystal';
  const resourceConfig = getResourceConfig(resourceType);
  const itemKind = config.itemKind ?? resourceConfig.itemKind;
  const itemName = config.itemName ?? resourceConfig.itemName;
  const makeItem =
    config.makeItem ??
    (() => ({
      id: `item-${now}-${Math.random().toString(16).slice(2)}`,
      kind: itemKind,
      name: itemName,
      count: 1,
    }));

  if (!player.inventory || !canAddItem(player.inventory, itemKind, stackMax)) {
    return null;
  }

  const item = makeItem();
  if (!addItem(player.inventory, item, stackMax)) return null;

  const respawnMsForNode = closest.respawnMs ?? getResourceRespawnMs(resourceType, respawnMs);
  closest.available = false;
  closest.respawnAt = now + respawnMsForNode;
  player.inv = countInventory(player.inventory);
  return closest;
}
