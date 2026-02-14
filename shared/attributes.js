// @ts-check
/**
 * Core attributes system per specs/mmorpg_attributes_combat_spec.md
 * STR, DEX, INT, VIT, SPI with class multipliers and derived combat stats.
 */

import {
  CLASS_BASE_ATTRIBUTES,
  CLASS_ATTRIBUTE_PROGRESSION,
} from './classes.js';
import { getStatsFromEquipment } from './equipment.js';

/** @typedef {{ str: number, dex: number, int: number, vit: number, spi: number }} RawAttributes */
/** @typedef {{ str: number, dex: number, int: number, vit: number, spi: number }} EffectiveAttributes */
/** @typedef {{ maxHp: number, maxMana: number, hpRegen: number, manaRegen: number, physicalPower: number, rangedPower: number, magicPower: number, healingPower: number, physicalDefense: number, magicResistance: number, critChance: number, armorPen: number, accuracy: number, evasion: number }} DerivedStats */

const CLASS_PRIMARY_ATTR = Object.fromEntries(
  Object.entries(CLASS_ATTRIBUTE_PROGRESSION).map(([k, v]) => [k, v.primary])
);
const CLASS_SECONDARY_ATTR = Object.fromEntries(
  Object.entries(CLASS_ATTRIBUTE_PROGRESSION).map(([k, v]) => [k, v.secondary])
);

// Class attribute multipliers (spec Section 3)
const CLASS_MULTIPLIERS = {
  fighter: { str: 1.0, dex: 0.4, int: 0.2, vit: 0.6, spi: 0.2 },
  guardian: { str: 0.5, dex: 0.2, int: 0.2, vit: 1.2, spi: 0.4 },
  mage: { str: 0.1, dex: 0.2, int: 1.1, vit: 0.3, spi: 0.7 },
  priest: { str: 0.2, dex: 0.2, int: 0.6, vit: 0.5, spi: 1.2 },
  ranger: { str: 0.4, dex: 1.1, int: 0.2, vit: 0.4, spi: 0.2 },
};

const MANA_CLASSES = new Set(['mage', 'priest']);

const ACCURACY_BASE = 100;
const ACCURACY_PER_DEX = 2;
const HIT_CHANCE_MIN = 0.05;
const HIT_CHANCE_MAX = 0.95;
const CRIT_CHANCE_CAP = 0.4;
const ARMOR_PEN_CAP = 0.3;

/**
 * Compute raw attributes (base + level progression + gear).
 * @param {Object} player - Player with classId, level, equipment
 * @returns {RawAttributes}
 */
export function computeRawAttributes(player) {
  const classId = player?.classId ?? 'fighter';
  const level = Math.max(1, Math.floor(player?.level ?? 1));
  const base = CLASS_BASE_ATTRIBUTES[classId] ?? CLASS_BASE_ATTRIBUTES.fighter;
  const gearStats = getStatsFromEquipment(player?.equipment ?? {});

  const levelsGained = level - 1;
  const primary = CLASS_PRIMARY_ATTR[classId] ?? 'str';
  const secondary = CLASS_SECONDARY_ATTR[classId] ?? 'dex';

  const raw = { ...base };

  for (let i = 0; i < levelsGained; i += 1) {
    raw[primary] = (raw[primary] ?? 0) + 1;
    raw[secondary] = (raw[secondary] ?? 0) + 0.5;
  }

  raw.str = (raw.str ?? 0) + (gearStats.str ?? 0);
  raw.dex = (raw.dex ?? 0) + (gearStats.dex ?? 0);
  raw.int = (raw.int ?? 0) + (gearStats.int ?? 0);
  raw.vit = (raw.vit ?? 0) + (gearStats.vit ?? 0);
  raw.spi = (raw.spi ?? 0) + (gearStats.spi ?? 0);

  return raw;
}

/**
 * Apply class multipliers to get effective attributes.
 * @param {RawAttributes} raw
 * @param {string} classId
 * @returns {EffectiveAttributes}
 */
export function computeEffectiveAttributes(raw, classId) {
  const mult = CLASS_MULTIPLIERS[classId] ?? CLASS_MULTIPLIERS.fighter;
  return {
    str: (raw.str ?? 0) * (mult.str ?? 1),
    dex: (raw.dex ?? 0) * (mult.dex ?? 1),
    int: (raw.int ?? 0) * (mult.int ?? 1),
    vit: (raw.vit ?? 0) * (mult.vit ?? 1),
    spi: (raw.spi ?? 0) * (mult.spi ?? 1),
  };
}

/**
 * Compute base health (spec Section 4.1).
 * @param {string} classId
 * @param {number} level
 * @returns {number}
 */
function getBaseHealth(classId, level) {
  const base = 50 + 5 * level;
  return classId === 'guardian' ? base + 10 : base;
}

/**
 * Compute base mana for mana classes (spec Section 4.2).
 * @param {number} level
 * @returns {number}
 */
function getBaseMana(level) {
  return 30 + 3 * level;
}

/**
 * Compute base defense (spec Section 4.6).
 * @param {string} classId
 * @param {number} level
 * @returns {number}
 */
function getBaseDefense(classId, level) {
  return classId === 'guardian' ? 2 * level : 0.5 * level;
}

/**
 * Get base mana regen from class passives (Mage Arcane Flow, Priest Divine Channeling).
 * @param {string} classId
 * @returns {number}
 */
function getBaseManaRegen(classId) {
  if (classId === 'mage') return 2;
  if (classId === 'priest') return 1.5;
  return 0;
}

/**
 * Compute all derived combat stats.
 * @param {Object} player - Player with classId, level, equipment
 * @returns {DerivedStats}
 */
export function computeDerivedStats(player) {
  const classId = player?.classId ?? 'fighter';
  const level = Math.max(1, Math.floor(player?.level ?? 1));
  const raw = computeRawAttributes(player);
  const eff = computeEffectiveAttributes(raw, classId);
  const gearStats = getStatsFromEquipment(player?.equipment ?? {});

  const baseHealth = getBaseHealth(classId, level);
  const baseMana = MANA_CLASSES.has(classId) ? getBaseMana(level) : 0;
  const baseDefense = getBaseDefense(classId, level);
  const baseManaRegen = getBaseManaRegen(classId);

  const maxHp = baseHealth + eff.vit * 12;
  const maxMana = baseMana + eff.int * 10;
  const hpRegen = 0.05 * eff.vit;
  const manaRegen = baseManaRegen + eff.int * 0.03 + eff.spi * 0.15;

  const physicalPower = eff.str * 2;
  const rangedPower = eff.dex * 2;
  const magicPower = eff.int * 2.5;
  let healingPower = eff.spi * 2;
  if (classId === 'priest') {
    healingPower *= 1.1;
  }

  const armorFromGear = gearStats.armor ?? 0;
  const resistanceFromGear = gearStats.magicResist ?? 0;
  const physicalDefense = baseDefense + armorFromGear;
  const magicResistance = baseDefense + resistanceFromGear;

  let critChance = Math.min(eff.dex * 0.0005, CRIT_CHANCE_CAP);
  if (classId === 'ranger') {
    critChance = Math.min(critChance * 1.2, CRIT_CHANCE_CAP);
  }
  const armorPen = Math.min(eff.str * 0.0005, ARMOR_PEN_CAP);

  const accuracy = ACCURACY_BASE + eff.dex * ACCURACY_PER_DEX + (gearStats.accuracy ?? 0);
  const evasion = gearStats.evasion ?? 0;

  return {
    maxHp: Math.max(1, Math.floor(maxHp)),
    maxMana: Math.max(0, Math.floor(maxMana)),
    hpRegen,
    manaRegen,
    physicalPower: Math.max(0, Math.floor(physicalPower)),
    rangedPower: Math.max(0, Math.floor(rangedPower)),
    magicPower: Math.max(0, Math.floor(magicPower)),
    healingPower: Math.max(0, Math.floor(healingPower)),
    physicalDefense: Math.max(0, Math.floor(physicalDefense)),
    magicResistance: Math.max(0, Math.floor(magicResistance)),
    critChance,
    armorPen,
    accuracy: Math.max(0, Math.floor(accuracy)),
    evasion: Math.max(0, Math.floor(evasion)),
  };
}

/**
 * Compute hit chance: Accuracy / (Accuracy + Evasion), clamped 5–95% (spec Section 5).
 * @param {number} attackerAccuracy
 * @param {number} targetEvasion
 * @returns {number}
 */
export function computeHitChance(attackerAccuracy, targetEvasion) {
  const acc = Math.max(0, attackerAccuracy);
  const ev = Math.max(0, targetEvasion);
  if (acc <= 0 && ev <= 0) return HIT_CHANCE_MAX;
  const raw = acc / (acc + ev);
  return Math.max(HIT_CHANCE_MIN, Math.min(HIT_CHANCE_MAX, raw));
}

export { CLASS_MULTIPLIERS };
