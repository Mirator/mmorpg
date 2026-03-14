// @ts-check
import {
  assemblePlayerModel,
  assembleVendorModel,
  loadGltf,
  loadPlayerAnimations,
  loadTexture,
} from './assets.js';
import { buildEquipmentVisualSignature } from './playerVisual.js';

/**
 * @typedef {{ key: string, run: () => unknown | Promise<unknown> }} WarmupTask
 */

/**
 * @param {string} key
 * @param {() => unknown | Promise<unknown>} run
 * @returns {WarmupTask}
 */
function createTask(key, run) {
  return { key, run };
}

/**
 * @param {WarmupTask[] | null | undefined} tasks
 * @returns {WarmupTask[]}
 */
function uniqueTasks(tasks) {
  const deduped = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task?.key || typeof task.run !== 'function') continue;
    if (!deduped.has(task.key)) {
      deduped.set(task.key, task);
    }
  }
  return [...deduped.values()];
}

/**
 * @param {{ scenePlan?: any, catalogPlan?: any }} [options]
 */
export function buildWarmupTiers({ scenePlan, catalogPlan } = {}) {
  const essential = scenePlan?.essential ?? {};
  const nearby = scenePlan?.nearby ?? {};
  const catalog = catalogPlan ?? {};

  const tier2 = uniqueTasks([
    ...(essential.playerVisuals ?? []).map((/** @type {any} */ visual) =>
      createTask(`player-visual:${buildEquipmentVisualSignature(visual)}`, () => assemblePlayerModel(visual))
    ),
    essential.playerAnimations ? createTask('player-animations', () => loadPlayerAnimations()) : null,
    essential.vendorModel ? createTask('vendor-model', () => assembleVendorModel()) : null,
    ...(essential.mobUrls ?? []).map((/** @type {any} */ url) => createTask(`gltf:${url}`, () => loadGltf(url))),
    ...(essential.resourceUrls ?? []).map((/** @type {any} */ url) =>
      createTask(`gltf:${url}`, () => loadGltf(url))
    ),
    ...(essential.structureUrls ?? []).map((/** @type {any} */ url) =>
      createTask(`gltf:${url}`, () => loadGltf(url))
    ),
  ]);

  const tier3 = uniqueTasks([
    ...(nearby.structureUrls ?? []).map((/** @type {any} */ url) =>
      createTask(`gltf:${url}`, () => loadGltf(url))
    ),
    ...(nearby.obstacleRockUrls ?? []).map((/** @type {any} */ url) =>
      createTask(`gltf:${url}`, () => loadGltf(url))
    ),
  ]);

  const tier4 = uniqueTasks([
    ...(catalog.playerVisuals ?? []).map((/** @type {any} */ visual) =>
      createTask(`player-visual:${buildEquipmentVisualSignature(visual)}`, () => assemblePlayerModel(visual))
    ),
    catalog.playerAnimations ? createTask('player-animations', () => loadPlayerAnimations()) : null,
    catalog.vendorModel ? createTask('vendor-model', () => assembleVendorModel()) : null,
    ...(catalog.gltfUrls ?? []).map((/** @type {any} */ url) => createTask(`gltf:${url}`, () => loadGltf(url))),
    ...(catalog.textureUrls ?? []).map((/** @type {any} */ url) =>
      createTask(`texture:${url}`, () => loadTexture(url))
    ),
  ]);

  return [tier2, tier3, tier4];
}
