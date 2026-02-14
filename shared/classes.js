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
      targetKind: 'any',
      attackType: 'melee',
      resourceCost: 30,
      baseValue: 10,
      coefficient: 0.4,
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
      damageTakenMultiplier: 0.7,
      pvpDamageTakenMultiplier: 0.8,
      moveSpeedMultiplier: 0.8,
    },
    {
      id: 'taunt',
      name: 'Taunt',
      slot: 4,
      cooldownMs: 8000,
      requiredLevel: 6,
      targetType: 'targeted',
      targetKind: 'mob',
      resourceCost: 25,
      range: 2.5,
      durationMs: 3000,
    },
    {
      id: 'shield_wall',
      name: 'Shield Wall',
      slot: 5,
      cooldownMs: 30000,
      requiredLevel: 10,
      targetType: 'self',
      resourceCost: 50,
      durationMs: 3000,
      damageTakenMultiplier: 0.5,
      pvpDamageTakenMultiplier: 0.7,
    },
    {
      id: 'fortify',
      name: 'Fortify',
      slot: 6,
      cooldownMs: 45000,
      requiredLevel: 15,
      targetType: 'self',
      resourceCost: 40,
      durationMs: 8000,
      maxHpMultiplier: 1.2,
    },
    {
      id: 'ground_slam',
      name: 'Ground Slam',
      slot: 7,
      cooldownMs: 15000,
      requiredLevel: 20,
      targetType: 'aoe',
      attackType: 'melee',
      resourceCost: 45,
      baseValue: 12,
      coefficient: 0.4,
      radius: 2.5,
      slowPct: 40,
      durationMs: 3000,
      pvpCCDurationMultiplier: 0.625,
    },
    {
      id: 'guardians_rebuke',
      name: "Guardian's Rebuke",
      slot: 8,
      cooldownMs: 12000,
      requiredLevel: 25,
      targetType: 'targeted',
      targetKind: 'any',
      attackType: 'melee',
      resourceCost: 30,
      baseValue: 8,
      coefficient: 0.35,
      interruptLockoutMs: 2000,
    },
    {
      id: 'unbreakable',
      name: 'Unbreakable',
      slot: 9,
      cooldownMs: 120000,
      requiredLevel: 30,
      targetType: 'self',
      resourceCost: 60,
      durationMs: 4000,
      pvpDurationMs: 2000,
      ccImmune: true,
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
      targetKind: 'any',
      attackType: 'melee',
      resourceCost: 40,
      baseValue: 20,
      coefficient: 0.8,
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
      baseValue: 15,
      coefficient: 0.5,
      coneDegrees: 120,
      range: 2.5,
    },
    {
      id: 'berserk',
      name: 'Berserk',
      slot: 4,
      cooldownMs: 60000,
      requiredLevel: 6,
      targetType: 'self',
      resourceCost: 30,
      durationMs: 6000,
      damageDealtMultiplier: 1.25,
      pvpDamageDealtMultiplier: 1.15,
    },
    {
      id: 'whirlwind',
      name: 'Whirlwind',
      slot: 5,
      cooldownMs: 10000,
      requiredLevel: 10,
      targetType: 'aoe',
      attackType: 'melee',
      resourceCost: 55,
      baseValue: 18,
      coefficient: 0.6,
      coneDegrees: 360,
      range: 2.5,
    },
    {
      id: 'execute',
      name: 'Execute',
      slot: 6,
      cooldownMs: 8000,
      requiredLevel: 15,
      targetType: 'targeted',
      targetKind: 'any',
      attackType: 'melee',
      resourceCost: 40,
      baseValue: 10,
      coefficient: 1.2,
      executeThresholdPct: 30,
    },
    {
      id: 'blood_rage',
      name: 'Blood Rage',
      slot: 7,
      cooldownMs: 90000,
      requiredLevel: 20,
      targetType: 'self',
      resourceCost: 0,
      durationMs: 6000,
      consumeAllRage: true,
    },
    {
      id: 'interrupting_strike',
      name: 'Interrupting Strike',
      slot: 8,
      cooldownMs: 12000,
      requiredLevel: 25,
      targetType: 'targeted',
      targetKind: 'any',
      attackType: 'melee',
      resourceCost: 35,
      baseValue: 8,
      coefficient: 0.5,
      interruptLockoutMs: 2000,
    },
    {
      id: 'avatar_of_war',
      name: 'Avatar of War',
      slot: 9,
      cooldownMs: 120000,
      requiredLevel: 30,
      targetType: 'self',
      resourceCost: 60,
      durationMs: 10000,
      physicalPowerMultiplier: 1.3,
      pvpPhysicalPowerMultiplier: 1.2,
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
      baseValue: 25,
      coefficient: 1.0,
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
      exemptFromGCD: true,
    },
    {
      id: 'poison_arrow',
      name: 'Poison Arrow',
      slot: 4,
      cooldownMs: 12000,
      requiredLevel: 6,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 30,
      baseValue: 6,
      coefficient: 0.2,
      dotTicks: 6,
      dotDurationMs: 6000,
    },
    {
      id: 'rapid_fire',
      name: 'Rapid Fire',
      slot: 5,
      cooldownMs: 15000,
      requiredLevel: 10,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 40,
      windUpMs: 1500,
      channelTicks: 3,
      baseValue: 12,
      coefficient: 0.5,
    },
    {
      id: 'snare_trap',
      name: 'Snare Trap',
      slot: 6,
      cooldownMs: 20000,
      requiredLevel: 15,
      targetType: 'aoe',
      attackType: 'ranged',
      resourceCost: 35,
      baseValue: 5,
      coefficient: 0.2,
      radius: 2.5,
      rootDurationMs: 2000,
      pvpCCDurationMultiplier: 0.5,
      requirePlacement: true,
      placementRange: 10,
    },
    {
      id: 'mark_target',
      name: 'Mark Target',
      slot: 7,
      cooldownMs: 15000,
      requiredLevel: 20,
      targetType: 'targeted',
      targetKind: 'any',
      resourceCost: 25,
      durationMs: 10000,
      markDamageBonusPct: 10,
    },
    {
      id: 'disengage_shot',
      name: 'Disengage Shot',
      slot: 8,
      cooldownMs: 18000,
      requiredLevel: 25,
      targetType: 'targeted',
      targetKind: 'any',
      attackType: 'ranged',
      resourceCost: 40,
      baseValue: 15,
      coefficient: 0.6,
      knockbackDistance: 2,
    },
    {
      id: 'eagle_eye',
      name: 'Eagle Eye',
      slot: 9,
      cooldownMs: 60000,
      requiredLevel: 30,
      targetType: 'self',
      resourceCost: 50,
      durationMs: 8000,
      critChanceBonusPct: 20,
      pvpCritChanceBonusPct: 10,
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
      baseValue: 15,
      coefficient: 0.9,
      supportTag: true,
    },
    {
      id: 'smite',
      name: 'Smite',
      slot: 3,
      cooldownMs: 5000,
      requiredLevel: 3,
      targetType: 'targeted',
      targetKind: 'any',
      attackType: 'ranged',
      resourceCost: 30,
      baseValue: 12,
      coefficient: 0.7,
      weakenedPct: 15,
    },
    {
      id: 'renew',
      name: 'Renew',
      slot: 4,
      cooldownMs: 8000,
      requiredLevel: 6,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 40,
      baseValue: 8,
      coefficient: 0.4,
      hotTicks: 8,
      hotDurationMs: 8000,
      supportTag: true,
    },
    {
      id: 'cleanse',
      name: 'Cleanse',
      slot: 5,
      cooldownMs: 12000,
      requiredLevel: 10,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 35,
    },
    {
      id: 'divine_shield',
      name: 'Divine Shield',
      slot: 6,
      cooldownMs: 30000,
      requiredLevel: 15,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 50,
      baseValue: 20,
      coefficient: 0.8,
      supportTag: true,
    },
    {
      id: 'prayer_of_light',
      name: 'Prayer of Light',
      slot: 7,
      cooldownMs: 20000,
      requiredLevel: 20,
      targetType: 'aoe',
      resourceCost: 60,
      baseValue: 12,
      coefficient: 0.5,
      radius: 5,
      pvpHealMultiplier: 0.8,
      requirePlacement: true,
      placementRange: 10,
    },
    {
      id: 'silence',
      name: 'Silence',
      slot: 8,
      cooldownMs: 24000,
      requiredLevel: 25,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 40,
      interruptLockoutMs: 2000,
    },
    {
      id: 'salvation',
      name: 'Salvation',
      slot: 9,
      cooldownMs: 300000,
      requiredLevel: 30,
      targetType: 'targeted',
      targetKind: 'player',
      resourceCost: 100,
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
      targetKind: 'any',
      attackType: 'ranged',
      resourceCost: 40,
      baseValue: 15,
      coefficient: 0.9,
      pvpDamageMultiplier: 0.8,
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
      baseValue: 8,
      coefficient: 0.4,
      radius: 2.5,
      slowPct: 50,
      durationMs: 3000,
      pvpCCDurationMultiplier: 0.6,
    },
    {
      id: 'arcane_missiles',
      name: 'Arcane Missiles',
      slot: 4,
      cooldownMs: 12000,
      requiredLevel: 6,
      targetType: 'targeted',
      targetKind: 'mob',
      attackType: 'ranged',
      resourceCost: 45,
      windUpMs: 1500,
      channelTicks: 3,
      baseValue: 10,
      coefficient: 0.4,
    },
    {
      id: 'flame_wave',
      name: 'Flame Wave',
      slot: 5,
      cooldownMs: 15000,
      requiredLevel: 10,
      targetType: 'aoe',
      resourceCost: 50,
      baseValue: 14,
      coefficient: 0.55,
      coneDegrees: 90,
      range: 5,
    },
    {
      id: 'ice_barrier',
      name: 'Ice Barrier',
      slot: 6,
      cooldownMs: 45000,
      requiredLevel: 15,
      targetType: 'self',
      resourceCost: 55,
      baseValue: 25,
      coefficient: 0.9,
    },
    {
      id: 'blink',
      name: 'Blink',
      slot: 7,
      cooldownMs: 24000,
      requiredLevel: 20,
      targetType: 'self',
      resourceCost: 40,
      dashDistance: 4,
      exemptFromGCD: true,
    },
    {
      id: 'counterspell',
      name: 'Counterspell',
      slot: 8,
      cooldownMs: 24000,
      requiredLevel: 25,
      targetType: 'targeted',
      targetKind: 'any',
      resourceCost: 35,
      interruptLockoutMs: 2000,
    },
    {
      id: 'meteor',
      name: 'Meteor',
      slot: 9,
      cooldownMs: 60000,
      requiredLevel: 30,
      targetType: 'aoe',
      resourceCost: 80,
      baseValue: 25,
      coefficient: 0.8,
      radius: 4,
      pvpDamageMultiplier: 0.7,
      requirePlacement: true,
      placementRange: 12,
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
