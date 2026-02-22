// @ts-check

/**
 * @typedef {{
 *   width: number,
 *   height: number,
 *   mapSize: number,
 *   zoom: number,
 *   offsetX: number,
 *   offsetY: number,
 *   padding: number,
 *   scale: number,
 *   centerX: number,
 *   centerY: number
 * }} ViewMetrics
 */

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   mapSize: number,
 *   zoom: number,
 *   offsetX: number,
 *   offsetY: number,
 *   padding?: number
 * }} params
 * @returns {ViewMetrics}
 */
export function createViewMetrics({
  width,
  height,
  mapSize,
  zoom,
  offsetX,
  offsetY,
  padding = 24,
}) {
  const usable = Math.max(32, Math.min(width, height) - padding * 2);
  const baseScale = mapSize > 0 ? usable / mapSize : 1;
  const scale = Math.max(0.0001, baseScale * Math.max(0.2, Math.min(8, zoom)));
  return {
    width,
    height,
    mapSize,
    zoom,
    offsetX,
    offsetY,
    padding,
    scale,
    centerX: width / 2 + offsetX,
    centerY: height / 2 + offsetY,
  };
}

/**
 * @param {{ x: number, z: number }} pos
 * @param {ViewMetrics} metrics
 */
export function worldToCanvas(pos, metrics) {
  return {
    x: metrics.centerX + pos.x * metrics.scale,
    y: metrics.centerY + pos.z * metrics.scale,
  };
}

/**
 * @param {{ x: number, y: number }} pos
 * @param {ViewMetrics} metrics
 */
export function canvasToWorld(pos, metrics) {
  return {
    x: (pos.x - metrics.centerX) / metrics.scale,
    z: (pos.y - metrics.centerY) / metrics.scale,
  };
}

/**
 * @param {any} mapConfig
 * @param {{ x: number, y?: number, z: number }} pos
 * @param {number} [radius=0]
 */
export function clampWorldPosition(mapConfig, pos, radius = 0) {
  const mapSize = Number(mapConfig?.mapSize) || 1;
  const half = mapSize / 2;
  const minX = -half + radius;
  const maxX = half - radius;
  const minZ = -half + radius;
  const maxZ = half - radius;
  let y = Number.isFinite(pos.y) ? Number(pos.y) : 0;
  if (
    Number.isFinite(mapConfig?.mapYMin) &&
    Number.isFinite(mapConfig?.mapYMax)
  ) {
    y = Math.min(mapConfig.mapYMax, Math.max(mapConfig.mapYMin, y));
  }
  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y,
    z: Math.min(maxZ, Math.max(minZ, pos.z)),
  };
}

/**
 * @param {{ x: number, y?: number, z: number }} pos
 * @param {boolean} enabled
 * @param {number} [gridSize=1]
 */
export function snapWorldPosition(pos, enabled, gridSize = 1) {
  if (!enabled) return { ...pos };
  const step = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 1;
  return {
    x: Math.round(pos.x / step) * step,
    y: pos.y,
    z: Math.round(pos.z / step) * step,
  };
}

/**
 * @param {{ x: number, y: number }} point
 * @param {{ x: number, y: number, w: number, h: number }} rect
 */
export function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 */
export function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
