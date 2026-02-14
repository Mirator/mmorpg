// @ts-check

export const MAP_CONFIG_VERSION = 1;

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePoint(raw) {
  const point = isObject(raw) ? raw : {};
  return {
    x: point.x ?? 0,
    y: point.y ?? 0,
    z: point.z ?? 0,
  };
}

function normalizeCircle(raw, defaults = {}) {
  const circle = isObject(raw) ? raw : {};
  return {
    x: circle.x ?? defaults.x ?? 0,
    y: circle.y ?? defaults.y ?? 0,
    z: circle.z ?? defaults.z ?? 0,
    radius: circle.radius ?? circle.r ?? defaults.radius ?? 0,
  };
}

function normalizeList(raw, mapFn) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => mapFn(item));
}

const VALID_RESOURCE_TYPES = new Set(['crystal', 'ore', 'herb']);

export function normalizeMapConfig(raw) {
  const config = isObject(raw) ? raw : {};
  return {
    version: config.version ?? MAP_CONFIG_VERSION,
    mapSize: config.mapSize ?? 0,
    mapYMin: config.mapYMin,
    mapYMax: config.mapYMax,
    base: normalizeCircle(config.base),
    spawnPoints: normalizeList(config.spawnPoints, normalizePoint),
    obstacles: normalizeList(config.obstacles, (item) => normalizeCircle(item)),
    resourceNodes: normalizeList(config.resourceNodes, (item) => {
      const type = isObject(item) && typeof item.type === 'string' ? item.type.trim().toLowerCase() : 'crystal';
      return {
        id: isObject(item) ? item.id ?? '' : '',
        x: isObject(item) ? item.x ?? 0 : 0,
        y: isObject(item) ? item.y ?? 0 : 0,
        z: isObject(item) ? item.z ?? 0 : 0,
        type: VALID_RESOURCE_TYPES.has(type) ? type : 'crystal',
      };
    }),
    vendors: normalizeList(config.vendors, (item) => ({
      id: isObject(item) ? item.id ?? '' : '',
      name: isObject(item) ? item.name ?? '' : '',
      x: isObject(item) ? item.x ?? 0 : 0,
      y: isObject(item) ? item.y ?? 0 : 0,
      z: isObject(item) ? item.z ?? 0 : 0,
    })),
    mobSpawns: normalizeList(config.mobSpawns, (item) => ({
      id: isObject(item) ? item.id ?? '' : '',
      x: isObject(item) ? item.x ?? 0 : 0,
      y: isObject(item) ? item.y ?? 0 : 0,
      z: isObject(item) ? item.z ?? 0 : 0,
    })),
  };
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function addError(errors, message) {
  errors.push(message);
}

function validatePoint(errors, label, point, half, yMin, yMax) {
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

function validateCircle(errors, label, circle, half, yMin, yMax) {
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

function validateId(errors, label, id, seen) {
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

export function validateMapConfig(config) {
  const errors = [];
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
    config.spawnPoints.forEach((point, index) => {
      validatePoint(errors, `spawnPoints[${index}]`, point, half, yMin, yMax);
    });
  }

  if (!Array.isArray(config.obstacles)) {
    addError(errors, 'obstacles must be an array.');
  } else {
    config.obstacles.forEach((obs, index) => {
      validateCircle(errors, `obstacles[${index}]`, obs, half, yMin, yMax);
    });
  }

  if (!Array.isArray(config.resourceNodes)) {
    addError(errors, 'resourceNodes must be an array.');
  } else {
    const seen = new Set();
    config.resourceNodes.forEach((node, index) => {
      validateId(errors, `resourceNodes[${index}]`, node?.id, seen);
      validatePoint(errors, `resourceNodes[${index}]`, node ?? {}, half, yMin, yMax);
      const type = node?.type;
      if (type !== undefined && type !== null && (!VALID_RESOURCE_TYPES.has(String(type).toLowerCase()))) {
        addError(errors, `resourceNodes[${index}] type must be crystal, ore, or herb.`);
      }
    });
  }

  if (!Array.isArray(config.vendors)) {
    addError(errors, 'vendors must be an array.');
  } else {
    const seen = new Set();
    config.vendors.forEach((vendor, index) => {
      validateId(errors, `vendors[${index}]`, vendor?.id, seen);
      if (typeof vendor?.name !== 'string' || vendor.name.trim().length === 0) {
        addError(errors, `vendors[${index}] name must be a non-empty string.`);
      }
      validatePoint(errors, `vendors[${index}]`, vendor ?? {}, half, yMin, yMax);
    });
  }

  if (!Array.isArray(config.mobSpawns)) {
    addError(errors, 'mobSpawns must be an array.');
  } else {
    const seen = new Set();
    config.mobSpawns.forEach((spawn, index) => {
      validateId(errors, `mobSpawns[${index}]`, spawn?.id, seen);
      validatePoint(errors, `mobSpawns[${index}]`, spawn ?? {}, half, yMin, yMax);
    });
  }

  return errors;
}
