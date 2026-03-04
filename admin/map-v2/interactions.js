// @ts-check

/**
 * @param {HTMLCanvasElement} canvas
 * @param {MouseEvent} event
 */
export function canvasPointFromMouse(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

/**
 * @param {{
 *   mapConfig: unknown,
 *   point: { x: number, y: number },
 *   coordReadout: HTMLElement,
 *   getMetrics: () => unknown,
 *   canvasToWorld: (point: { x: number, y: number }, metrics: unknown) => { x: number, z: number },
 *   formatNumber: (value: number, digits?: number) => string,
 * }} params
 */
export function updateCoordinateReadout({
  mapConfig,
  point,
  coordReadout,
  getMetrics,
  canvasToWorld,
  formatNumber,
}) {
  if (!mapConfig) return;
  const world = canvasToWorld(point, getMetrics());
  coordReadout.textContent = `X: ${formatNumber(world.x, 2)} Z: ${formatNumber(world.z, 2)}`;
}

/**
 * @param {{
 *   measure: { start: { x: number, z: number } | null, end: { x: number, z: number } | null },
 *   start: { x: number, z: number } | null,
 *   end: { x: number, z: number } | null,
 *   measureReadout: HTMLElement,
 *   formatNumber: (value: number, digits?: number) => string,
 * }} params
 */
export function updateMeasure({ measure, start, end, measureReadout, formatNumber }) {
  measure.start = start;
  measure.end = end;
  if (!start || !end) {
    measureReadout.textContent = 'Measure: --';
    return;
  }
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  measureReadout.textContent = `Measure: d=${formatNumber(dist, 2)} (dx=${formatNumber(dx, 2)}, dz=${formatNumber(dz, 2)})`;
}
