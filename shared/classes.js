// @ts-check
import { COMBAT_CONFIG } from './config.js';

/**
 * @typedef {Object} ClassDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {number} attackRange
 * @property {string} defaultWeaponKind
 * @property {string} blurb
 */

/**
 * @typedef {Object} AbilityDefinition
 * @property {string} id
 * @property {string} name
 * @property {number} slot
 * @property {number} cooldownMs
 * @property {number} range
 * @property {number} requiredLevel
 * @property {'melee' | 'ranged' | null} [attackType]
 * @property {'targeted' | 'aoe' | 'self' | 'none'} targetType
 * @property {'mob' | 'player' | 'any'} [targetKind]
 * @property {number} [resourceCost]
 * @property {number} [windUpMs]
 * @property {number} [baseValue] - Damage/heal base (Damage = baseValue + Power × coefficient)
 * @property {number} [coefficient] - Scaling factor for relevant power stat
 * @property {number} [radius]
 * @property {number} [coneDegrees]
 * @property {number} [dashDistance]
 * @property {number} [durationMs]
 * @property {number} [slowPct]
 * @property {number} [stunDurationMs]
 * @property {number} [stunImmunityMs]
 * @property {number} [weakenedPct]
 * @property {number} [moveSpeedMultiplier]
 * @property {number} [damageTakenMultiplier]
 * @property {number} [rangeMultiplier]
 * @property {boolean} [exemptFromGCD]
 * @property {boolean} [supportTag]
 * @property {number} [pvpDamageMultiplier]
 * @property {number} [pvpHealMultiplier]
 * @property {number} [pvpCCDurationMultiplier]
 */

export const DEFAULT_CLASS_ID = 'fighter';
export const ABILITY_SLOTS = 10;

export const /** @type {any} */ CLASS_RESOURCES = {
  guardian: {
    type: 'stamina',
    max: 100,
    regenOutOfCombat: 10,
    regenInCombat: 5,
  },
  fighter: {
    type: 'rage',
    max: 100,
    gainOnHit: 8,
    gainOnDamage: 4,
    decayOutOfCombat: 5,
  },
  ranger: {
    type: 'focus',
    max: 100,
    regenMoving: 6,
    regenStanding: 12,
  },
  priest: {
    type: 'mana',
    max: 120,
    regenOutOfCombat: 10,
    regenInCombat: 6,
  },
  mage: {
    type: 'mana',
    max: 100,
    regen: 8,
  },
};

/** Base attributes per class (spec Section 2) */
export const /** @type {any} */ CLASS_BASE_ATTRIBUTES = {
  fighter: { str: 12, dex: 8, int: 4, vit: 10, spi: 4 },
  guardian: { str: 8, dex: 5, int: 4, vit: 14, spi: 6 },
  mage: { str: 3, dex: 6, int: 14, vit: 6, spi: 10 },
  priest: { str: 4, dex: 6, int: 10, vit: 8, spi: 14 },
  ranger: { str: 6, dex: 14, int: 4, vit: 8, spi: 5 },
};

/** Primary and secondary attributes for +1/+0.5 per-level gain */
export const /** @type {any} */ CLASS_ATTRIBUTE_PROGRESSION = {
  fighter: { primary: 'str', secondary: 'dex' },
  guardian: { primary: 'vit', secondary: 'spi' },
  mage: { primary: 'int', secondary: 'spi' },
  priest: { primary: 'spi', secondary: 'int' },
  ranger: { primary: 'dex', secondary: 'str' },
};

export const /** @type {any} */ CLASSES = [
  {
    id: 'guardian',
    name: 'Guardian',
    role: 'Tank',
    attackRange: 2.0,
    defaultWeaponKind: 'weapon_training_sword',
    blurb: 'Heavy armor and steady defense.',
  },
  {
    id: 'fighter',
    name: 'Fighter',
    role: 'Melee DPS',
    attackRange: 2.0,
    defaultWeaponKind: 'weapon_training_sword',
    blurb: 'Balanced frontline damage.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    role: 'Ranged DPS',
    attackRange: 6.0,
    defaultWeaponKind: 'weapon_training_bow',
    blurb: 'Quick shots from afar.',
  },
  {
    id: 'priest',
    name: 'Priest',
    role: 'Healer',
    attackRange: 6.0,
    defaultWeaponKind: 'weapon_training_staff',
    blurb: 'Support magic and healing arts.',
  },
  {
    id: 'mage',
    name: 'Mage',
    role: 'Magic DPS',
    attackRange: 6.0,
    defaultWeaponKind: 'weapon_apprentice_wand',
    blurb: 'Arcane burst from range.',
  },
];

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((/** @type {any} */ klass) => [klass.id, klass]));

/** @typedef {{ attackType?: string, range?: number, kind?: string }} WeaponLike */

export function isValidClassId(/** @type {any} */ id) {
  return typeof id === 'string' && Boolean(CLASS_BY_ID[id]);
}

export function getClassById(/** @type {any} */ id) {
  return CLASS_BY_ID[id] ?? CLASS_BY_ID[DEFAULT_CLASS_ID];
}

export function getResourceForClass(/** @type {any} */ classId) {
  const resource = CLASS_RESOURCES[classId];
  if (resource) return resource;
  return CLASS_RESOURCES[DEFAULT_CLASS_ID] ?? null;
}

import {
  CLASS_ABILITY_TEMPLATES,
  resolveAbilityRange,
} from './abilityTemplates.js';

export { CLASS_ABILITY_TEMPLATES } from './abilityTemplates.js';


/**
 * @param {string} classId
 * @param {number} [level]
 * @param {WeaponLike | null} [weaponDef]
 */
export function getAbilitiesForClass(classId, level = 1, weaponDef = null) {
  const klass = getClassById(classId);
  const attackType = weaponDef?.attackType ?? null;
  const weaponRange = weaponDef?.range;
  const range = Number.isFinite(weaponRange) ? weaponRange : klass.attackRange;
  let name = 'Basic Attack';
  if (attackType === 'melee') {
    name = 'Slash';
  } else if (attackType === 'ranged') {
    name = weaponDef?.kind?.includes('bow') ? 'Shot' : 'Bolt';
  }
  const /** @type {any} */ abilities = [
    {
      id: 'basic_attack',
      name,
      slot: 1,
      cooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
      range,
      requiredLevel: 1,
      attackType,
      targetType: 'targeted',
      targetKind: 'mob',
    },
  ];
  const templates = CLASS_ABILITY_TEMPLATES[klass.id] ?? [];
  for (const template of templates) {
    if ((level ?? 1) < (template.requiredLevel ?? 1)) continue;
    const abilityRange = resolveAbilityRange(template, range);
    abilities.push({
      ...template,
      range: abilityRange,
    });
  }
  return abilities;
}

/**
 * @param {string} classId
 * @param {number} slot
 * @param {number} [level]
 * @param {WeaponLike | null} [weaponDef]
 */
export function getAbilityForSlot(classId, slot, level = 1, weaponDef = null) {
  const abilities = getAbilitiesForClass(classId, level, weaponDef);
  return abilities.find((/** @type {any} */ ability) => ability.slot === slot) ?? null;
}

/**
 * @param {string} classId
 * @param {string} abilityId
 * @param {number} [level]
 * @param {WeaponLike | null} [weaponDef]
 */
export function getAbilityById(classId, abilityId, level = 1, weaponDef = null) {
  const abilities = getAbilitiesForClass(classId, level, weaponDef);
  return abilities.find((/** @type {any} */ ability) => ability.id === abilityId) ?? null;
}
