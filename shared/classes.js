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
 * @property {number} [damageBase]
 * @property {number} [damagePerLevel]
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
 */

export const DEFAULT_CLASS_ID = 'fighter';
export const ABILITY_SLOTS = 10;

export const CLASS_RESOURCES = {
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
export const CLASS_BASE_ATTRIBUTES = {
  fighter: { str: 12, dex: 8, int: 4, vit: 10, spi: 4 },
  guardian: { str: 8, dex: 5, int: 4, vit: 14, spi: 6 },
  mage: { str: 3, dex: 6, int: 14, vit: 6, spi: 10 },
  priest: { str: 4, dex: 6, int: 10, vit: 8, spi: 14 },
  ranger: { str: 6, dex: 14, int: 4, vit: 8, spi: 5 },
};

/** Primary and secondary attributes for +1/+0.5 per-level gain */
export const CLASS_ATTRIBUTE_PROGRESSION = {
  fighter: { primary: 'str', secondary: 'dex' },
  guardian: { primary: 'vit', secondary: 'spi' },
  mage: { primary: 'int', secondary: 'spi' },
  priest: { primary: 'spi', secondary: 'int' },
  ranger: { primary: 'dex', secondary: 'str' },
};

export const CLASSES = [
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

export const CLASS_BY_ID = Object.fromEntries(CLASSES.map((klass) => [klass.id, klass]));

export function isValidClassId(id) {
  return typeof id === 'string' && Boolean(CLASS_BY_ID[id]);
}

export function getClassById(id) {
  return CLASS_BY_ID[id] ?? CLASS_BY_ID[DEFAULT_CLASS_ID];
}

export function getResourceForClass(classId) {
  const resource = CLASS_RESOURCES[classId];
  if (resource) return resource;
  return CLASS_RESOURCES[DEFAULT_CLASS_ID] ?? null;
}

const CLASS_ABILITY_TEMPLATES = {
  guardian: [
    {
      id: 'shield_slam',
      name: 'Shield Slam',
      slot: 2,
      cooldownMs: 6000,
      requiredLevel: 2,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'melee',
      resourceCost: 30,
      damageBase: 8,
      damagePerLevel: 1,
      stunDurationMs: 800,
      stunImmunityMs: 6000,
    },
    {
      id: 'defensive_stance',
      name: 'Defensive Stance',
      slot: 3,
      cooldownMs: 12000,
      requiredLevel: 3,
      targetType: 'self',
      resourceCost: 40,
      durationMs: 4000,
      damageTakenMultiplier: 0.6,
      moveSpeedMultiplier: 0.8,
    },
  ],
  fighter: [
    {
      id: 'power_strike',
      name: 'Power Strike',
      slot: 2,
      cooldownMs: 5000,
      requiredLevel: 2,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'melee',
      resourceCost: 40,
      damageBase: 20,
      damagePerLevel: 2,
    },
    {
      id: 'cleave',
      name: 'Cleave',
      slot: 3,
      cooldownMs: 8000,
      requiredLevel: 3,
      targetType: 'aoe',
      attackType: 'melee',
      resourceCost: 50,
      damageBase: 14,
      damagePerLevel: 1.5,
      coneDegrees: 120,
      range: 2.5,
    },
  ],
  ranger: [
    {
      id: 'aimed_shot',
      name: 'Aimed Shot',
      slot: 2,
      cooldownMs: 6000,
      requiredLevel: 2,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 35,
      windUpMs: 600,
      damageBase: 22,
      damagePerLevel: 2,
      rangeMultiplier: 1.2,
    },
    {
      id: 'roll_back',
      name: 'Roll Back',
      slot: 3,
      cooldownMs: 10000,
      requiredLevel: 3,
      targetType: 'self',
      resourceCost: 30,
      dashDistance: 3,
      durationMs: 1000,
    },
  ],
  priest: [
    {
      id: 'heal',
      name: 'Heal',
      slot: 2,
      cooldownMs: 4000,
      requiredLevel: 2,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 35,
      range: 5,
      damageBase: -18,
      damagePerLevel: -2,
    },
    {
      id: 'smite',
      name: 'Smite',
      slot: 3,
      cooldownMs: 5000,
      requiredLevel: 3,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 30,
      damageBase: 16,
      damagePerLevel: 1.5,
      weakenedPct: 15,
    },
  ],
  mage: [
    {
      id: 'firebolt',
      name: 'Firebolt',
      slot: 2,
      cooldownMs: 5000,
      requiredLevel: 2,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 40,
      damageBase: 24,
      damagePerLevel: 2.5,
      rangeMultiplier: 1.3,
    },
    {
      id: 'frost_nova',
      name: 'Frost Nova',
      slot: 3,
      cooldownMs: 12000,
      requiredLevel: 3,
      targetType: 'aoe',
      resourceCost: 50,
      damageBase: 10,
      damagePerLevel: 1,
      radius: 2.5,
      slowPct: 60,
      durationMs: 3000,
    },
  ],
};

function resolveAbilityRange(template, baseRange) {
  if (Number.isFinite(template?.range)) return template.range;
  if (Number.isFinite(template?.rangeMultiplier)) {
    return baseRange * template.rangeMultiplier;
  }
  return baseRange;
}

export function getAbilitiesForClass(classId, level = 1, weaponDef = null) {
  const klass = getClassById(classId);
  const attackType = weaponDef?.attackType ?? null;
  const range = Number.isFinite(weaponDef?.range) ? weaponDef.range : klass.attackRange;
  let name = 'Basic Attack';
  if (attackType === 'melee') {
    name = 'Slash';
  } else if (attackType === 'ranged') {
    name = weaponDef?.kind?.includes('bow') ? 'Shot' : 'Bolt';
  }
  const abilities = [
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

export function getAbilityForSlot(classId, slot, level = 1, weaponDef = null) {
  const abilities = getAbilitiesForClass(classId, level, weaponDef);
  return abilities.find((ability) => ability.slot === slot) ?? null;
}

export function getAbilityById(classId, abilityId, level = 1, weaponDef = null) {
  const abilities = getAbilitiesForClass(classId, level, weaponDef);
  return abilities.find((ability) => ability.id === abilityId) ?? null;
}
