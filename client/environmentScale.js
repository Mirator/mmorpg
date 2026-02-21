// @ts-check

export const CHARACTER_HEIGHT = 2.0;
export const ENV_SCALE_PROFILE = 'gameplayReadable';

/** @type {Record<string, { fenceHeight: number, houseHeight: number, civicHeight: number, millHeight: number, towerHeight: number }>} */
export const ENV_SCALE_TARGETS = {
  gameplayReadable: {
    fenceHeight: 1.45,
    houseHeight: 5.6,
    civicHeight: 6.2,
    millHeight: 7.2,
    towerHeight: 9.2,
  },
};

/** @type {Record<string, { uniformMultiplier?: number, yScale?: number }>} */
export const ENV_SCALE_OVERRIDES = {
  storage: { uniformMultiplier: 1.2 },
  villageCenterModel: { yScale: 0.82 },
};

/** @type {Record<string, string>} */
const CATEGORY_TO_TARGET = {
  house: 'houseHeight',
  civic: 'civicHeight',
  mill: 'millHeight',
  tower: 'towerHeight',
  villageCenter: 'civicHeight',
};

/**
 * @param {any} value
 * @returns {number}
 */
function finiteOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * @param {any} value
 * @param {number} fallback
 * @returns {number}
 */
function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * @param {{
 *   key: string,
 *   category: string,
 *   modelBounds: { x: number, y: number, z: number },
 *   baseRadius?: number,
 *   profile?: string,
 * }} params
 */
export function computeEnvironmentScale(params) {
  const key = params?.key ?? 'unknown';
  const category = params?.category ?? 'house';
  const profile = params?.profile ?? ENV_SCALE_PROFILE;
  const profileTargets =
    ENV_SCALE_TARGETS[profile] ??
    ENV_SCALE_TARGETS[ENV_SCALE_PROFILE];
  const targetKey = CATEGORY_TO_TARGET[category] ?? CATEGORY_TO_TARGET.house;
  const targetMap = /** @type {Record<string, number>} */ (profileTargets);
  const baseTargetHeight = finitePositive(targetMap[targetKey], 4.5);
  const override = ENV_SCALE_OVERRIDES[key] ?? null;
  const uniformMultiplier = finitePositive(override?.uniformMultiplier, 1);
  const yScaleMultiplier = finitePositive(override?.yScale, 1);
  const targetHeight = baseTargetHeight * uniformMultiplier;

  const rawX = finiteOrZero(params?.modelBounds?.x);
  const rawY = finiteOrZero(params?.modelBounds?.y);
  const rawZ = finiteOrZero(params?.modelBounds?.z);
  const valid = rawY > 0;
  const uniformScale = valid ? targetHeight / rawY : 1;
  const scale = {
    x: uniformScale,
    y: uniformScale * yScaleMultiplier,
    z: uniformScale,
  };

  return {
    key,
    category,
    profile,
    baseRadius: finiteOrZero(params?.baseRadius),
    rawBounds: { x: rawX, y: rawY, z: rawZ },
    targetHeight,
    uniformScale,
    yScaleMultiplier,
    scale,
    effectiveHeight: rawY * scale.y,
    valid,
  };
}
