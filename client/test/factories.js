import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';

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

export function findAbilityById(abilities, id) {
  return abilities.find((ability) => ability.id === id) ?? null;
}

export function resolveSlottedAbilities(abilities, slottedIds = []) {
  return slottedIds.map((id) => (id ? findAbilityById(abilities, id) : null));
}

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
