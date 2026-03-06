// @ts-check
import { ARMOR_TO_OUTFIT } from './assetPaths.js';

const DEFAULT_OUTFIT_STYLE = 'cloth';
const OUTFIT_STYLE_SET = new Set(['cloth', 'leather']);

function normalizeItemKind(/** @type {any} */ value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOutfitStyle(/** @type {any} */ value) {
  if (typeof value !== 'string') return DEFAULT_OUTFIT_STYLE;
  return OUTFIT_STYLE_SET.has(value) ? value : DEFAULT_OUTFIT_STYLE;
}

function resolveOutfitStyleForKind(/** @type {any} */ itemKind) {
  const normalizedKind = normalizeItemKind(itemKind);
  if (!normalizedKind) return null;
  if (Object.prototype.hasOwnProperty.call(ARMOR_TO_OUTFIT, normalizedKind)) {
    return ARMOR_TO_OUTFIT[/** @type {keyof typeof ARMOR_TO_OUTFIT} */ (normalizedKind)];
  }
  if (normalizedKind.includes('leather') || normalizedKind.includes('plate')) return 'leather';
  if (normalizedKind.includes('cloth')) return 'cloth';
  return null;
}

export function resolveOutfitStyleFromEquipment(/** @type {any} */ equipment) {
  const slotPriority = ['chest', 'legs', 'feet', 'head'];
  for (const slot of slotPriority) {
    const style = resolveOutfitStyleForKind(equipment?.[slot]?.kind);
    if (style) return style;
  }
  return DEFAULT_OUTFIT_STYLE;
}

/**
 * @param {any} equipment
 * @returns {{ outfitStyle: string, headKind: string | null, weaponKind: string | null, offhandKind: string | null }}
 */
export function buildEquipmentVisualState(equipment) {
  return {
    outfitStyle: resolveOutfitStyleFromEquipment(equipment),
    headKind: normalizeItemKind(equipment?.head?.kind),
    weaponKind: normalizeItemKind(equipment?.weapon?.kind),
    offhandKind: normalizeItemKind(equipment?.offhand?.kind),
  };
}

/**
 * @param {any} visual
 * @returns {{ outfitStyle: string, headKind: string | null, weaponKind: string | null, offhandKind: string | null }}
 */
export function normalizeEquipmentVisualState(visual) {
  return {
    outfitStyle: normalizeOutfitStyle(visual?.outfitStyle),
    headKind: normalizeItemKind(visual?.headKind),
    weaponKind: normalizeItemKind(visual?.weaponKind),
    offhandKind: normalizeItemKind(visual?.offhandKind),
  };
}

export function buildEquipmentVisualSignature(/** @type {any} */ visual) {
  const normalized = normalizeEquipmentVisualState(visual);
  return [
    `outfit:${normalized.outfitStyle}`,
    `head:${normalized.headKind ?? '-'}`,
    `weapon:${normalized.weaponKind ?? '-'}`,
    `offhand:${normalized.offhandKind ?? '-'}`,
  ].join('|');
}
