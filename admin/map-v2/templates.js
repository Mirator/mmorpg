// @ts-check

import { MOB_TYPES, RESOURCE_TYPE_LIST } from '/shared/entityTypes.js';
import { STRUCTURE_KIND_LIST } from '/shared/mapConfig.js';

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   type: 'spawnPoints' | 'obstacles' | 'structures' | 'resourceNodes' | 'vendors' | 'mobSpawns',
 *   tags: string[]
 * }} TemplateDefinition
 */

/** @type {TemplateDefinition[]} */
export const TEMPLATE_DEFINITIONS = [
  {
    id: 'spawn-point',
    label: 'Spawn Point',
    type: 'spawnPoints',
    tags: ['spawn'],
  },
  {
    id: 'obstacle',
    label: 'Obstacle',
    type: 'obstacles',
    tags: ['props'],
  },
  ...STRUCTURE_KIND_LIST.map((kind) => ({
    id: `structure-${kind}`,
    label: `Structure: ${kind}`,
    type: /** @type {'structures'} */ ('structures'),
    tags: ['props', 'structure', kind],
  })),
  ...RESOURCE_TYPE_LIST.map((type) => ({
    id: `resource-${type}`,
    label: `Resource: ${type}`,
    type: /** @type {'resourceNodes'} */ ('resourceNodes'),
    tags: ['props', 'resource', type],
  })),
  {
    id: 'vendor',
    label: 'Vendor',
    type: 'vendors',
    tags: ['props', 'npc'],
  },
  ...MOB_TYPES.map((mobType) => ({
    id: `mob-${mobType}`,
    label: `Mob Spawn: ${mobType}`,
    type: /** @type {'mobSpawns'} */ ('mobSpawns'),
    tags: ['spawn', 'mob', mobType],
  })),
];

/**
 * @param {any[]} list
 * @param {string} prefix
 */
function nextId(list, prefix) {
  const used = new Set(list.map((item) => String(item?.id ?? '')));
  let i = 1;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

/**
 * @param {string} templateId
 * @param {any} mapConfig
 * @param {{ x: number, y?: number, z: number }} worldPos
 * @returns {{ type: string, item: any } | null}
 */
export function instantiateTemplate(templateId, mapConfig, worldPos) {
  const baseY = Number.isFinite(mapConfig?.base?.y) ? mapConfig.base.y : 0;
  const pos = {
    x: worldPos.x,
    y: Number.isFinite(worldPos.y) ? worldPos.y : baseY,
    z: worldPos.z,
  };

  if (templateId === 'spawn-point') {
    return {
      type: 'spawnPoints',
      item: { x: pos.x, y: pos.y, z: pos.z },
    };
  }

  if (templateId === 'obstacle') {
    return {
      type: 'obstacles',
      item: { x: pos.x, y: pos.y, z: pos.z, radius: 6 },
    };
  }

  if (templateId.startsWith('structure-')) {
    const kind = templateId.slice('structure-'.length);
    return {
      type: 'structures',
      item: {
        id: nextId(Array.isArray(mapConfig?.structures) ? mapConfig.structures : [], 'structure-'),
        kind,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        rotation: 0,
        colliderRadius: 3,
        collides: true,
      },
    };
  }

  if (templateId.startsWith('resource-')) {
    const resourceType = templateId.slice('resource-'.length);
    return {
      type: 'resourceNodes',
      item: {
        id: nextId(Array.isArray(mapConfig?.resourceNodes) ? mapConfig.resourceNodes : [], 'r'),
        type: resourceType,
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
    };
  }

  if (templateId === 'vendor') {
    return {
      type: 'vendors',
      item: {
        id: nextId(Array.isArray(mapConfig?.vendors) ? mapConfig.vendors : [], 'vendor-'),
        name: 'Vendor',
        x: pos.x,
        y: pos.y,
        z: pos.z,
      },
    };
  }

  if (templateId.startsWith('mob-')) {
    const mobType = templateId.slice('mob-'.length);
    return {
      type: 'mobSpawns',
      item: {
        id: nextId(Array.isArray(mapConfig?.mobSpawns) ? mapConfig.mobSpawns : [], 'm'),
        mobType,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        aggressive: true,
      },
    };
  }

  return null;
}

/**
 * @param {TemplateDefinition[]} templates
 * @param {string} query
 */
export function filterTemplates(templates, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return templates;
  return templates.filter((template) => {
    return (
      template.label.toLowerCase().includes(normalized) ||
      template.id.toLowerCase().includes(normalized) ||
      template.tags.some((tag) => tag.toLowerCase().includes(normalized))
    );
  });
}
