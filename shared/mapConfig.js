// @ts-check

import { VALID_MOB_TYPES, VALID_RESOURCE_TYPES } from './entityTypes.js';
import { VENDOR_BUY_ITEMS } from './economy.js';

const VALID_VENDOR_BUY_KINDS = new Set(VENDOR_BUY_ITEMS.map((/** @type {any} */ e) => e.kind));

export const MAP_CONFIG_VERSION = 2;
export const STRUCTURE_KIND_LIST = [
  'fence',
  'market',
  'barracks',
  'storage',
  'houseA',
  'houseB',
  'bellTower',
  'villageCenter',
];
export const VALID_STRUCTURE_KINDS = new Set(STRUCTURE_KIND_LIST.map((/** @type {any} */ kind) => kind.toLowerCase()));
const STRUCTURE_KIND_LOOKUP = new Map(
  STRUCTURE_KIND_LIST.map((/** @type {any} */ kind) => [kind.toLowerCase(), kind])
);

function isObject(/** @type {any} */ value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePoint(/** @type {any} */ raw) {
  const point = isObject(raw) ? raw : {};
  return {
    x: point.x ?? 0,
    y: point.y ?? 0,
    z: point.z ?? 0,
  };
}

function normalizeCircle(/** @type {any} */ raw, /** @type {any} */ defaults = {}) {
  const circle = isObject(raw) ? raw : {};
  return {
    x: circle.x ?? defaults.x ?? 0,
    y: circle.y ?? defaults.y ?? 0,
    z: circle.z ?? defaults.z ?? 0,
    radius: circle.radius ?? circle.r ?? defaults.radius ?? 0,
  };
}

function normalizeList(/** @type {any} */ raw, /** @type {any} */ mapFn) {
  if (!Array.isArray(raw)) return [];
  return raw.map((/** @type {any} */ item) => mapFn(item));
}

function normalizeStructure(/** @type {any} */ raw) {
  const structure = isObject(raw) ? raw : {};
  const kindRaw = typeof structure.kind === 'string'
    ? structure.kind.trim().toLowerCase()
    : '';
  const kind = STRUCTURE_KIND_LOOKUP.get(kindRaw) ?? kindRaw;
  const collides = structure.collides !== false;
  const colliderRadius = Number.isFinite(structure.colliderRadius)
    ? structure.colliderRadius
    : undefined;
  return {
    id: structure.id ?? '',
    kind,
    x: structure.x ?? 0,
    y: structure.y ?? 0,
    z: structure.z ?? 0,
    rotation: Number.isFinite(structure.rotation) ? structure.rotation : 0,
    colliderRadius,
    collides,
  };
}

export function normalizeMapConfig(/** @type {any} */ raw) {
  const config = isObject(raw) ? raw : {};
  return {
    version: config.version ?? MAP_CONFIG_VERSION,
    mapSize: config.mapSize ?? 0,
    mapYMin: config.mapYMin,
    mapYMax: config.mapYMax,
    base: normalizeCircle(config.base),
    spawnPoints: normalizeList(config.spawnPoints, normalizePoint),
    obstacles: normalizeList(config.obstacles, (/** @type {any} */ item) => normalizeCircle(item)),
    structures: normalizeList(config.structures, normalizeStructure),
    resourceNodes: normalizeList(config.resourceNodes, (/** @type {any} */ item) => {
      const type = isObject(item) && typeof item.type === 'string' ? item.type.trim().toLowerCase() : 'crystal';
      const respawnMs = isObject(item) && Number.isFinite(item.respawnMs) ? item.respawnMs : undefined;
      return {
        id: isObject(item) ? item.id ?? '' : '',
        x: isObject(item) ? item.x ?? 0 : 0,
        y: isObject(item) ? item.y ?? 0 : 0,
        z: isObject(item) ? item.z ?? 0 : 0,
        type: VALID_RESOURCE_TYPES.has(type) ? type : 'crystal',
        respawnMs,
      };
    }),
    vendors: normalizeList(config.vendors, (/** @type {any} */ item) => {
      const raw = isObject(item) ? item : {};
      const buyItems = Array.isArray(raw.buyItems)
        ? raw.buyItems
            .filter((/** @type {any} */ e) => isObject(e) && typeof e.kind === 'string' && VALID_VENDOR_BUY_KINDS.has(e.kind.trim()))
            .map((/** @type {any} */ e) => ({
              kind: e.kind.trim(),
              priceCopper: Number.isFinite(e.priceCopper) ? e.priceCopper : undefined,
            }))
        : undefined;
      return {
        id: raw.id ?? '',
        name: raw.name ?? '',
        x: raw.x ?? 0,
        y: raw.y ?? 0,
        z: raw.z ?? 0,
        buyItems: buyItems && buyItems.length > 0 ? buyItems : undefined,
      };
    }),
    mobSpawns: normalizeList(config.mobSpawns, (/** @type {any} */ item) => {
      const raw = isObject(item) ? item : {};
      const aggressive = raw.aggressive !== false;
      const level = Number.isFinite(raw.level) ? raw.level : undefined;
      const levelVariance = Number.isFinite(raw.levelVariance) && raw.levelVariance >= 0 ? raw.levelVariance : 0;
      return {
        id: raw.id ?? '',
        x: raw.x ?? 0,
        y: raw.y ?? 0,
        z: raw.z ?? 0,
        mobType: typeof raw.mobType === 'string' ? raw.mobType.trim().toLowerCase() : 'orc',
        aggressive,
        level,
        levelVariance,
      };
    }),
  };
}

function isFiniteNumber(/** @type {any} */ value) {
  return Number.isFinite(value);
}

function addError(/** @type {any} */ errors, /** @type {any} */ message) {
  errors.push(message);
}

function validatePoint(/** @type {any} */ errors, /** @type {any} */ label, /** @type {any} */ point, /** @type {any} */ half, /** @type {any} */ yMin, /** @type {any} */ yMax) {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.z)) {
    addError(errors, `${label} must have numeric x/z.`);
    return;
  }
  const py = point.y ?? 0;
  if (
    Number.isFinite(yMin) &&
    Number.isFinite(yMax) &&
    (py < yMin || py > yMax)
  ) {
    addError(errors, `${label} y must be within [${yMin}, ${yMax}].`);
  }
  if (point.x < -half || point.x > half || point.z < -half || point.z > half) {
    addError(errors, `${label} must be within map bounds.`);
  }
}

function validateCircle(/** @type {any} */ errors, /** @type {any} */ label, /** @type {any} */ circle, /** @type {any} */ half, /** @type {any} */ yMin, /** @type {any} */ yMax) {
  if (!isFiniteNumber(circle.x) || !isFiniteNumber(circle.z)) {
    addError(errors, `${label} must have numeric x/z.`);
    return;
  }
  const cy = circle.y ?? 0;
  if (
    Number.isFinite(yMin) &&
    Number.isFinite(yMax) &&
    (cy < yMin || cy > yMax)
  ) {
    addError(errors, `${label} y must be within [${yMin}, ${yMax}].`);
  }
  if (!isFiniteNumber(circle.radius) || circle.radius <= 0) {
    addError(errors, `${label} radius must be > 0.`);
    return;
  }
  if (
    circle.x < -half + circle.radius ||
    circle.x > half - circle.radius ||
    circle.z < -half + circle.radius ||
    circle.z > half - circle.radius
  ) {
    addError(errors, `${label} must be within map bounds (including radius).`);
  }
}

function validateId(/** @type {any} */ errors, /** @type {any} */ label, /** @type {any} */ id, /** @type {any} */ seen) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    addError(errors, `${label} id must be a non-empty string.`);
    return;
  }
  const trimmed = id.trim();
  if (seen.has(trimmed)) {
    addError(errors, `${label} id "${trimmed}" must be unique.`);
    return;
  }
  seen.add(trimmed);
}

export function validateMapConfig(/** @type {any} */ config) {
  const /** @type {any} */ errors = [];
  if (!isFiniteNumber(config?.mapSize) || config.mapSize <= 0) {
    addError(errors, 'mapSize must be a positive number.');
    return errors;
  }

  const half = config.mapSize / 2;
  const yMin = config.mapYMin;
  const yMax = config.mapYMax;
  if (!isObject(config.base)) {
    addError(errors, 'base is required.');
  } else {
    validateCircle(errors, 'base', config.base, half, yMin, yMax);
  }

  if (config.version !== MAP_CONFIG_VERSION) {
    addError(
      errors,
      `version must be ${MAP_CONFIG_VERSION}.`
    );
  }

  if (!Array.isArray(config.spawnPoints)) {
    addError(errors, 'spawnPoints must be an array.');
  } else {
    config.spawnPoints.forEach((/** @type {any} */ point, /** @type {any} */ index) => {
      validatePoint(errors, `spawnPoints[${index}]`, point, half, yMin, yMax);
    });
  }

  if (!Array.isArray(config.obstacles)) {
    addError(errors, 'obstacles must be an array.');
  } else {
    config.obstacles.forEach((/** @type {any} */ obs, /** @type {any} */ index) => {
      validateCircle(errors, `obstacles[${index}]`, obs, half, yMin, yMax);
    });
  }

  if (!Array.isArray(config.structures)) {
    addError(errors, 'structures must be an array.');
  } else {
    const seen = new Set();
    config.structures.forEach((/** @type {any} */ structure, /** @type {any} */ index) => {
      validateId(errors, `structures[${index}]`, structure?.id, seen);
      validatePoint(errors, `structures[${index}]`, structure ?? {}, half, yMin, yMax);

      const kind = typeof structure?.kind === 'string'
        ? structure.kind.trim().toLowerCase()
        : '';
      if (!VALID_STRUCTURE_KINDS.has(kind)) {
        addError(
          errors,
          `structures[${index}] kind must be one of: ${STRUCTURE_KIND_LIST.join(', ')}.`
        );
      }

      if (!isFiniteNumber(structure?.rotation ?? 0)) {
        addError(errors, `structures[${index}] rotation must be numeric.`);
      }

      const collides = structure?.collides !== false;
      const colliderRadius = structure?.colliderRadius;
      if (collides) {
        if (!isFiniteNumber(colliderRadius) || colliderRadius <= 0) {
          addError(errors, `structures[${index}] colliderRadius must be > 0 when collides is true.`);
        } else if (
          isFiniteNumber(structure?.x) &&
          isFiniteNumber(structure?.z) &&
          (
            structure.x < -half + colliderRadius ||
            structure.x > half - colliderRadius ||
            structure.z < -half + colliderRadius ||
            structure.z > half - colliderRadius
          )
        ) {
          addError(errors, `structures[${index}] collider must be within map bounds.`);
        }
      } else if (
        colliderRadius !== undefined &&
        colliderRadius !== null &&
        (!isFiniteNumber(colliderRadius) || colliderRadius <= 0)
      ) {
        addError(errors, `structures[${index}] colliderRadius must be > 0 when provided.`);
      }
    });
  }

  if (!Array.isArray(config.resourceNodes)) {
    addError(errors, 'resourceNodes must be an array.');
  } else {
    const seen = new Set();
    config.resourceNodes.forEach((/** @type {any} */ node, /** @type {any} */ index) => {
      validateId(errors, `resourceNodes[${index}]`, node?.id, seen);
      validatePoint(errors, `resourceNodes[${index}]`, node ?? {}, half, yMin, yMax);
      const type = node?.type;
      if (type !== undefined && type !== null && !VALID_RESOURCE_TYPES.has(String(type).toLowerCase())) {
        addError(errors, `resourceNodes[${index}] type must be one of: ${[...VALID_RESOURCE_TYPES].join(', ')}.`);
      }
    });
  }

  if (!Array.isArray(config.vendors)) {
    addError(errors, 'vendors must be an array.');
  } else {
    const seen = new Set();
    config.vendors.forEach((/** @type {any} */ vendor, /** @type {any} */ index) => {
      validateId(errors, `vendors[${index}]`, vendor?.id, seen);
      if (typeof vendor?.name !== 'string' || vendor.name.trim().length === 0) {
        addError(errors, `vendors[${index}] name must be a non-empty string.`);
      }
      validatePoint(errors, `vendors[${index}]`, vendor ?? {}, half, yMin, yMax);
      const buyItems = vendor?.buyItems;
      if (Array.isArray(buyItems)) {
        buyItems.forEach((/** @type {any} */ entry, /** @type {any} */ bi) => {
          const kind = entry?.kind;
          if (!kind || typeof kind !== 'string' || !VALID_VENDOR_BUY_KINDS.has(kind.trim())) {
            addError(errors, `vendors[${index}] buyItems[${bi}] kind must be a valid buy item kind.`);
          }
        });
      }
    });
  }

  if (!Array.isArray(config.mobSpawns)) {
    addError(errors, 'mobSpawns must be an array.');
  } else {
    const seen = new Set();
    config.mobSpawns.forEach((/** @type {any} */ spawn, /** @type {any} */ index) => {
      validateId(errors, `mobSpawns[${index}]`, spawn?.id, seen);
      validatePoint(errors, `mobSpawns[${index}]`, spawn ?? {}, half, yMin, yMax);
      const mobType = spawn?.mobType;
      if (mobType !== undefined && mobType !== null && !VALID_MOB_TYPES.has(String(mobType).toLowerCase())) {
        addError(errors, `mobSpawns[${index}] mobType must be one of: ${[...VALID_MOB_TYPES].join(', ')}.`);
      }
    });
  }

  return errors;
}
