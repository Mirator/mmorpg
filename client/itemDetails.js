// @ts-check
import {
  EQUIP_SLOTS,
  getStatsFromEquipment,
  getWeaponDef,
  isBrokenItem,
  isDurabilityTrackedItem,
} from '/shared/equipment.js';
import { getItemCategoryLabel, resolvePrimaryEquipSlotForItem } from './itemMeta.js';

const STAT_FIELDS = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['int', 'INT'],
  ['vit', 'VIT'],
  ['spi', 'SPI'],
  ['armor', 'Armor'],
  ['magicResist', 'Magic Resist'],
  ['accuracy', 'Accuracy'],
  ['evasion', 'Evasion'],
];

const SPEED_TIER_LABELS = /** @type {Record<string, string>} */ ({
  slow: 'Slow',
  medium: 'Medium',
  fast: 'Fast',
});

const ATTACK_TYPE_LABELS = /** @type {Record<string, string>} */ ({
  melee: 'Melee',
  ranged: 'Ranged',
});

function toBaseEquipment(/** @type {any} */ equipment) {
  const /** @type {Record<string, any>} */ base = {};
  for (const slot of EQUIP_SLOTS) {
    base[slot] = equipment?.[slot] ?? null;
  }
  return base;
}

export function getItemDurabilityState(/** @type {any} */ item) {
  if (!isDurabilityTrackedItem(item)) return 'none';
  if (isBrokenItem(item)) return 'broken';
  const maxDurability = Math.max(1, Number(item?.maxDurability) || 1);
  const durability = Math.max(0, Number(item?.durability ?? maxDurability) || 0);
  const ratio = durability / maxDurability;
  if (ratio <= 0.35) return 'worn';
  return 'normal';
}

function getEquipmentComparisonLines(/** @type {any} */ item, /** @type {any} */ equipment) {
  const slot = resolvePrimaryEquipSlotForItem(item);
  if (!slot) return [];
  const base = toBaseEquipment(equipment);
  const before = /** @type {Record<string, number>} */ (getStatsFromEquipment(base));
  const after = /** @type {Record<string, number>} */ (getStatsFromEquipment({
    ...base,
    [slot]: item,
  }));
  const lines = [];
  for (const [field, label] of STAT_FIELDS) {
    const diff = Math.round((after?.[field] ?? 0) - (before?.[field] ?? 0));
    if (!diff) continue;
    lines.push(`${diff > 0 ? '+' : ''}${diff} ${label}`);
  }
  return lines;
}

function getWeaponPresentationLines(/** @type {any} */ item) {
  const def = getWeaponDef(item?.kind);
  if (!def) return [];
  const lines = [];
  if (def.attackType) {
    lines.push(`Attack: ${ATTACK_TYPE_LABELS[String(def.attackType)] ?? def.attackType}`);
  }
  if (Number.isFinite(def.range)) {
    lines.push(`Range: ${Number(def.range).toFixed(1)}m`);
  }
  if (def.speedTier) {
    lines.push(`Speed: ${SPEED_TIER_LABELS[String(def.speedTier)] ?? def.speedTier}`);
  }
  if (def.family) {
    lines.push(`Family: ${def.family}`);
  }
  if (def.flavor) {
    lines.push(def.flavor);
  }
  return lines;
}

export function describeItemForTooltip(
  /** @type {any} */ item,
  /** @type {{ stackMax?: number, equipment?: any, includeComparison?: boolean }} */ opts = {}
) {
  const name = item?.name ?? item?.kind ?? 'Item';
  const count = Math.max(1, Math.floor(Number(item?.count) || 1));
  const stackMax = Math.max(1, Math.floor(Number(opts?.stackMax) || 1));
  const rarity = typeof item?.rarity === 'string' && item.rarity ? item.rarity : null;
  const durabilityState = getItemDurabilityState(item);
  const baseLines = [
    `Type: ${getItemCategoryLabel(item?.kind)}`,
    `Stack: ${count}/${stackMax}`,
  ];
  if (rarity) baseLines.push(`Rarity: ${rarity}`);
  if (isDurabilityTrackedItem(item)) {
    baseLines.push(`Durability: ${item?.durability ?? 0}/${item?.maxDurability ?? 0}`);
  }
  const flags = [];
  if (item?.isStarter === true) flags.push('Starter');
  if (item?.craftedProfession) flags.push(`Crafted (${item.craftedProfession})`);
  const comparisonLines = opts?.includeComparison
    ? getEquipmentComparisonLines(item, opts?.equipment)
    : [];
  return {
    title: name,
    baseLines,
    flags,
    comparisonLines,
    weaponLines: getWeaponPresentationLines(item),
    durabilityState,
  };
}
