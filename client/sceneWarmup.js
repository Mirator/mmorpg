// @ts-check
import { buildMedievalStructureLayout, isMedievalBuildingKind } from '../shared/medievalBuildings.js';
import { ASSET_PATHS, getPreloadAssetList } from './assetPaths.js';
import {
  buildEquipmentVisualSignature,
  buildEquipmentVisualState,
  normalizeEquipmentVisualState,
} from './playerVisual.js';

/**
 * @typedef {{ x: number, z: number }} FocusPosition
 * @typedef {{ id: string, key: string, x: number, y: number, z: number, rotation: number }} StructurePlacement
 */

export const ESSENTIAL_ENVIRONMENT_RADIUS = 45;
export const NEARBY_ENVIRONMENT_RADIUS = 70;

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
function toFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

/**
 * @param {{ x?: number | null, z?: number | null } | null | undefined} a
 * @param {{ x?: number | null, z?: number | null } | null | undefined} b
 */
export function distanceSquared2d(a, b) {
  const dx = toFiniteNumber(a?.x) - toFiniteNumber(b?.x);
  const dz = toFiniteNumber(a?.z) - toFiniteNumber(b?.z);
  return dx * dx + dz * dz;
}

/**
 * @param {{ worldConfig?: any, localPlayer?: any }} [options]
 * @returns {FocusPosition}
 */
export function resolveWarmupFocusPosition({ worldConfig, localPlayer } = {}) {
  if (Number.isFinite(localPlayer?.x) && Number.isFinite(localPlayer?.z)) {
    return { x: localPlayer.x, z: localPlayer.z };
  }
  return {
    x: toFiniteNumber(worldConfig?.base?.x),
    z: toFiniteNumber(worldConfig?.base?.z),
  };
}

/**
 * @param {any} worldConfig
 * @returns {StructurePlacement[]}
 */
export function getAllStreamableStructurePlacements(worldConfig) {
  const environmentPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.environment ?? {});
  return (Array.isArray(worldConfig?.structures) ? worldConfig.structures : [])
    .filter((/** @type {any} */ structure) => {
      const kind = structure?.kind;
      return !!kind && (isMedievalBuildingKind(kind) || typeof environmentPaths[kind] === 'string');
    })
    .map((/** @type {any} */ structure) => ({
      id: structure.id ?? structure.kind,
      key: structure.kind,
      x: toFiniteNumber(structure.x),
      y: toFiniteNumber(structure.y),
      z: toFiniteNumber(structure.z),
      rotation: toFiniteNumber(structure.rotation),
    }));
}

/**
 * @param {any} worldConfig
 * @param {FocusPosition} focusPos
 * @param {number} radius
 * @param {{ excludeIds?: string[] }} [options]
 * @returns {StructurePlacement[]}
 */
export function getStructurePlacementsInRange(worldConfig, focusPos, radius, { excludeIds = [] } = {}) {
  const radiusSq = Math.max(0, radius) * Math.max(0, radius);
  const excluded = new Set(excludeIds);
  return getAllStreamableStructurePlacements(worldConfig).filter((placement) => {
    if (excluded.has(placement.id)) return false;
    return distanceSquared2d(placement, focusPos) <= radiusSq;
  });
}

/**
 * @param {StructurePlacement[] | null | undefined} placements
 * @returns {string[]}
 */
export function getStructureAssetUrls(placements) {
  const environmentPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.environment ?? {});
  const partPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.medieval?.parts ?? {});
  const urls = new Set();

  for (const placement of Array.isArray(placements) ? placements : []) {
    if (!placement?.key) continue;
    if (isMedievalBuildingKind(placement.key)) {
      const layout = buildMedievalStructureLayout({
        id: placement.id ?? placement.key,
        kind: placement.key,
        x: placement.x ?? 0,
        y: placement.y ?? 0,
        z: placement.z ?? 0,
        rotation: placement.rotation ?? 0,
      });
      const uniquePartKeys = [...new Set(layout?.parts?.map((part) => part.partKey) ?? [])];
      for (const partKey of uniquePartKeys) {
        const url = partPaths[partKey];
        if (typeof url === 'string') urls.add(url);
      }
      continue;
    }
    const url = environmentPaths[placement.key];
    if (typeof url === 'string') urls.add(url);
  }

  return [...urls];
}

/**
 * @param {unknown} value
 * @param {unknown} modulus
 */
function hashStableIndex(value, modulus) {
  const size = Number(modulus);
  if (!Number.isInteger(size) || size <= 0) return 0;
  const text = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash % size;
}

/**
 * @param {any[] | null | undefined} resources
 * @returns {string[]}
 */
export function getResourceWarmupUrls(resources) {
  const resourceNodePaths = /** @type {Record<string, string>} */ (ASSET_PATHS.resourceNodes ?? {});
  const urls = new Set();
  for (const resource of Array.isArray(resources) ? resources : []) {
    const type = resource?.type ?? 'crystal';
    if (type === 'crystal') {
      const variants = /** @type {string[] | undefined} */ (ASSET_PATHS.resourceNodeVariants?.crystal);
      if (Array.isArray(variants) && variants.length > 0) {
        urls.add(variants[hashStableIndex(resource?.id, variants.length)]);
        continue;
      }
    }
    const url = resourceNodePaths[type] ?? resourceNodePaths.crystal;
    if (typeof url === 'string') urls.add(url);
  }
  return [...urls];
}

/**
 * @param {any[] | null | undefined} mobs
 * @returns {string[]}
 */
export function getMobWarmupUrls(mobs) {
  const monsterPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.monsters ?? {});
  const urls = new Set();
  for (const mob of Array.isArray(mobs) ? mobs : []) {
    const type = mob?.mobType ?? 'orc';
    const url = monsterPaths[type] ?? monsterPaths.orc;
    if (typeof url === 'string') urls.add(url);
  }
  return [...urls];
}

/** @param {any} player */
function resolvePlayerVisualState(player) {
  if (player?.visual) return normalizeEquipmentVisualState(player.visual);
  if (player?.equipment) return buildEquipmentVisualState(player.equipment);
  return normalizeEquipmentVisualState(null);
}

/**
 * @param {{ localPlayer?: any, publicPlayers?: Record<string, any> | null }} [options]
 */
export function getPlayerVisualWarmups({ localPlayer, publicPlayers } = {}) {
  const deduped = new Map();
  if (localPlayer) {
    const visual = resolvePlayerVisualState(localPlayer);
    deduped.set(buildEquipmentVisualSignature(visual), visual);
  }
  for (const player of Object.values(publicPlayers ?? {})) {
    const visual = resolvePlayerVisualState(player);
    deduped.set(buildEquipmentVisualSignature(visual), visual);
  }
  return [...deduped.values()];
}

/**
 * @param {any} worldConfig
 * @param {FocusPosition} focusPos
 * @param {number} radius
 */
function hasVendorsInRange(worldConfig, focusPos, radius) {
  const radiusSq = radius * radius;
  return (Array.isArray(worldConfig?.vendors) ? worldConfig.vendors : []).some((/** @type {any} */ vendor) =>
    distanceSquared2d(vendor, focusPos) <= radiusSq
  );
}

/**
 * @param {any} worldConfig
 * @param {FocusPosition} focusPos
 * @param {number} radius
 */
function hasObstaclesInRange(worldConfig, focusPos, radius) {
  const radiusSq = radius * radius;
  return (Array.isArray(worldConfig?.obstacles) ? worldConfig.obstacles : []).some((/** @type {any} */ obstacle) =>
    distanceSquared2d(obstacle, focusPos) <= radiusSq
  );
}

/**
 * @param {{
 *   worldConfig?: any,
 *   localPlayer?: any,
 *   publicPlayers?: Record<string, any> | null,
 *   mobs?: any[],
 *   resources?: any[],
 * }} [options]
 */
export function buildSceneWarmupPlan({
  worldConfig,
  localPlayer = null,
  publicPlayers = null,
  mobs = [],
  resources = [],
} = {}) {
  const focusPos = resolveWarmupFocusPosition({ worldConfig, localPlayer });
  const essentialPlacements = getStructurePlacementsInRange(
    worldConfig,
    focusPos,
    ESSENTIAL_ENVIRONMENT_RADIUS
  );
  const nearbyPlacements = getStructurePlacementsInRange(
    worldConfig,
    focusPos,
    NEARBY_ENVIRONMENT_RADIUS,
    { excludeIds: essentialPlacements.map((placement) => placement.id) }
  );

  return {
    focusPos,
    essential: {
      playerVisuals: getPlayerVisualWarmups({ localPlayer, publicPlayers }),
      playerAnimations: true,
      vendorModel: hasVendorsInRange(worldConfig, focusPos, ESSENTIAL_ENVIRONMENT_RADIUS),
      mobUrls: getMobWarmupUrls(mobs),
      resourceUrls: getResourceWarmupUrls(resources),
      structurePlacements: essentialPlacements,
      structureUrls: getStructureAssetUrls(essentialPlacements),
    },
    nearby: {
      structurePlacements: nearbyPlacements,
      structureUrls: getStructureAssetUrls(nearbyPlacements),
      obstacleRockUrls: hasObstaclesInRange(worldConfig, focusPos, NEARBY_ENVIRONMENT_RADIUS)
        ? [...(ASSET_PATHS.rocks ?? [])]
        : [],
    },
  };
}

export function buildCatalogWarmupPlan() {
  const list = getPreloadAssetList();
  return {
    playerVisuals: [normalizeEquipmentVisualState(null)],
    playerAnimations: true,
    vendorModel: true,
    gltfUrls: [
      ...(list.vendor ?? []),
      ...(list.villageCenter ?? []),
      ...(list.corpses ?? []),
      ...(list.mobs ?? []),
      ...(list.environment ?? []),
      ...(list.medievalParts ?? []),
      ...(list.rocks ?? []),
      ...(list.resourceNodes ?? []),
    ],
    textureUrls: [...(list.textures ?? [])],
  };
}
