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
 */

export const DEFAULT_CLASS_ID = 'fighter';
export const ABILITY_SLOTS = 10;

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
  return [
    {
      id: 'basic_attack',
      name,
      slot: 1,
      cooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
      range,
      requiredLevel: 1,
      attackType,
      targetType: 'targeted',
    },
  ];
}
