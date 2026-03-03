// @ts-check
import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';

/**
 * @param {Record<string, any>} [overrides]
 */
export function buildPlayer(overrides = {}) {
  return {
    classId: 'fighter',
    level: 1,
    equipment: {},
    globalCooldownUntil: 0,
    attackCooldownUntil: 0,
    abilityCooldowns: {},
    resource: 100,
    x: 0,
    z: 0,
    xp: 0,
    xpToNext: 10,
    ...overrides,
  };
}

/**
 * @param {any[]} abilities
 * @param {string | null | undefined} id
 */
export function findAbilityById(abilities, id) {
  return abilities.find((/** @type {any} */ ability) => ability.id === id) ?? null;
}

/**
 * @param {any[]} abilities
 * @param {(string | null | undefined)[]} [slottedIds]
 */
export function resolveSlottedAbilities(abilities, slottedIds = []) {
  return slottedIds.map((id) => (id ? findAbilityById(abilities, id) : null));
}

/**
 * @param {{
 *   classId?: string;
 *   level?: number;
 *   equipment?: Record<string, any>;
 *   slottedIds?: (string | null | undefined)[];
 * }} [options]
 */
export function buildAbilityPanelState({
  classId = 'fighter',
  level = 1,
  equipment = {},
  slottedIds = [],
} = {}) {
  const weaponDef = getEquippedWeapon(equipment, classId);
  const abilities = getAbilitiesForClass(classId, level, weaponDef);
  const slottedAbilities = resolveSlottedAbilities(abilities, slottedIds);
  while (slottedAbilities.length < 10) {
    slottedAbilities.push(null);
  }
  return {
    classId,
    weaponDef,
    abilities,
    slottedAbilities,
    loadoutSignature: slottedAbilities.map((ability) => ability?.id ?? '-').join('|'),
  };
}
