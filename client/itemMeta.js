// @ts-check
import { EQUIP_SLOTS, isItemAllowedInSlot } from '/shared/equipment.js';

const RESOURCE_KINDS = new Set(['crystal', 'ore', 'herb', 'wood', 'flower']);

export const ITEM_CATEGORY_ORDER = ['weapon', 'offhand', 'armor', 'consumable', 'material', 'misc'];

const ITEM_CATEGORY_LABELS = {
  weapon: 'Weapon',
  offhand: 'Offhand',
  armor: 'Armor',
  consumable: 'Consumable',
  material: 'Material',
  misc: 'Misc',
};

export function getItemCategoryFromKind(/** @type {any} */ kind) {
  const normalized = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (!normalized) return 'misc';
  if (normalized.startsWith('weapon_')) return 'weapon';
  if (normalized.startsWith('offhand_') || normalized.startsWith('shield_')) return 'offhand';
  if (
    normalized.startsWith('armor_') ||
    normalized.startsWith('head_') ||
    normalized.startsWith('chest_') ||
    normalized.startsWith('legs_') ||
    normalized.startsWith('feet_') ||
    normalized.startsWith('boots_')
  ) {
    return 'armor';
  }
  if (normalized.startsWith('consumable_')) return 'consumable';
  if (RESOURCE_KINDS.has(normalized)) return 'material';
  return 'misc';
}

export function getItemCategoryLabel(/** @type {any} */ kind) {
  const category = getItemCategoryFromKind(kind);
  return ITEM_CATEGORY_LABELS[category] ?? ITEM_CATEGORY_LABELS.misc;
}

export function resolvePrimaryEquipSlotForItem(/** @type {any} */ item) {
  for (const slot of EQUIP_SLOTS) {
    if (isItemAllowedInSlot(item, slot)) return slot;
  }
  return null;
}

export function compareByCategoryThenName(/** @type {any} */ a, /** @type {any} */ b) {
  const categoryA = getItemCategoryFromKind(a?.kind);
  const categoryB = getItemCategoryFromKind(b?.kind);
  const idxA = ITEM_CATEGORY_ORDER.indexOf(categoryA);
  const idxB = ITEM_CATEGORY_ORDER.indexOf(categoryB);
  if (idxA !== idxB) return idxA - idxB;
  const nameA = String(a?.name ?? a?.kind ?? '').toLowerCase();
  const nameB = String(b?.name ?? b?.kind ?? '').toLowerCase();
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return 0;
}
