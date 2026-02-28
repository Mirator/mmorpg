// @ts-check
import {
  getAbilitiesForClass,
  getResourceForClass,
} from '../../../shared/classes.js';
import { getEquippedWeapon } from '../../../shared/equipment.js';
import {
  computeDerivedStats,
  computeHitChance,
} from '../../../shared/attributes.js';

export function getRelevantPower(/** @type {any} */ derived, /** @type {any} */ attackType) {
  if (attackType === 'melee') return derived.physicalPower;
  if (attackType === 'ranged') return derived.rangedPower;
  return derived.magicPower;
}

function getRelevantPowerForAbility(/** @type {any} */ derived, /** @type {any} */ ability, /** @type {any} */ classId) {
  const /** @type {any} */ magicClasses = ['mage', 'priest'];
  const /** @type {any} */ magicAbilities = ['firebolt', 'frost_nova', 'smite'];
  if (magicAbilities.includes(ability?.id) || (magicClasses.includes(classId) && ability?.id !== 'basic_attack')) {
    return derived.magicPower;
  }
  const attackType = ability?.attackType;
  if (attackType === 'melee') return derived.physicalPower;
  if (attackType === 'ranged') return derived.rangedPower;
  return derived.magicPower;
}

export function applyPvpDamageMultiplier(/** @type {any} */ damage, /** @type {any} */ ability, /** @type {any} */ isPvP) {
  if (!isPvP) return damage;
  const mult = ability?.pvpDamageMultiplier ?? 1.0;
  return Math.max(0, Math.floor(damage * mult));
}

export function applyPvpHealMultiplier(/** @type {any} */ heal, /** @type {any} */ ability, /** @type {any} */ isPvP) {
  if (!isPvP) return heal;
  const mult = ability?.pvpHealMultiplier ?? 1.0;
  return Math.max(0, Math.floor(heal * mult));
}

export function applyPvpCCDurationMultiplier(/** @type {any} */ durationMs, /** @type {any} */ ability, /** @type {any} */ isPvP) {
  if (!isPvP) return durationMs;
  const mult = ability?.pvpCCDurationMultiplier ?? 1.0;
  return Math.max(0, Math.floor(durationMs * mult));
}

/**
 * Damage = baseValue + (Relevant Power × coefficient)
 * @param {any} player
 * @param {any} ability
 * @param {number} [now]
 * @param {boolean} [isPvP] - When true, use PvP variants of self-buffs (Berserk, Avatar, Eagle Eye)
 */
export function computeAbilityDamage(player, ability, now = 0, isPvP = false) {
  const baseValue = ability.baseValue ?? 0;
  const coefficient = ability.coefficient ?? 0;
  const derived = computeDerivedStats(player);
  let relevantPower = getRelevantPowerForAbility(derived, ability, player.classId);
  if ((player.avatarOfWarUntil ?? 0) > now && ability?.attackType === 'melee') {
    const powMult = isPvP ? (player.pvpPhysicalPowerMultiplier ?? 1.2) : (player.physicalPowerMultiplier ?? 1.3);
    relevantPower = Math.floor(relevantPower * powMult);
  }
  let damage = Math.max(0, Math.floor(baseValue + relevantPower * coefficient));
  let critChance = derived.critChance ?? 0;
  if ((player.eagleEyeUntil ?? 0) > now) {
    const critBonus = isPvP ? (player.pvpCritChanceBonusPct ?? 10) : (player.critChanceBonusPct ?? 20);
    critChance = Math.min(0.4, critChance + critBonus / 100);
  }
  const isCrit = rollCrit(critChance);
  if (isCrit) {
    damage = Math.floor(damage * 2);
  }
  if ((player.berserkUntil ?? 0) > now) {
    const dmgMult = isPvP ? (player.pvpDamageDealtMultiplier ?? 1.15) : (player.damageDealtMultiplier ?? 1.25);
    damage = Math.floor(damage * dmgMult);
  }
  if ((player.bloodRageUntil ?? 0) > now) {
    damage = Math.floor(damage * (player.bloodRageDamageMultiplier ?? 1));
  }
  return { damage, derived, isCrit };
}

/**
 * Damage = baseValue + (Relevant Power × coefficient)
 */
export function computeOutgoingDamage(/** @type {any} */ baseValue, /** @type {any} */ coefficient, /** @type {any} */ relevantPower) {
  return Math.max(0, Math.floor(baseValue + relevantPower * coefficient));
}

export function rollHit(/** @type {any} */ attackerAccuracy, /** @type {any} */ targetEvasion) {
  const hitChance = computeHitChance(attackerAccuracy, targetEvasion);
  return Math.random() < hitChance;
}

export function rollCrit(/** @type {any} */ critChance) {
  return Math.random() < critChance;
}

export function clamp(/** @type {any} */ value, /** @type {any} */ min, /** @type {any} */ max) {
  return Math.max(min, Math.min(max, value));
}

export function clampResource(/** @type {any} */ player, /** @type {any} */ value) {
  let max = Number.isFinite(player?.resourceMax) ? player.resourceMax : 0;
  if (max <= 0) {
    const resourceDef = getResourceForClass(player?.classId);
    max = resourceDef?.max ?? 0;
  }
  return clamp(value ?? 0, 0, max);
}

export function getAbilityForSlot(/** @type {any} */ player, /** @type {any} */ slot) {
  if (!player) return null;
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const abilities = getAbilitiesForClass(player?.classId, player?.level ?? 1, weaponDef);
  return abilities.find((/** @type {any} */ ability) => ability.slot === slot) ?? null;
}

export function getAbilityById(/** @type {any} */ player, /** @type {any} */ abilityId) {
  if (!player) return null;
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const abilities = getAbilitiesForClass(player?.classId, player?.level ?? 1, weaponDef);
  return abilities.find((/** @type {any} */ ability) => ability.id === abilityId) ?? null;
}

export function getAbilityCooldownUntil(/** @type {any} */ player, /** @type {any} */ abilityId) {
  if (!player || !abilityId) return 0;
  return Number(player?.abilityCooldowns?.[abilityId]) || 0;
}

export function setAbilityCooldown(/** @type {any} */ player, /** @type {any} */ abilityId, /** @type {any} */ until) {
  if (!player || !abilityId) return;
  if (!player.abilityCooldowns || typeof player.abilityCooldowns !== 'object') {
    player.abilityCooldowns = {};
  }
  player.abilityCooldowns[abilityId] = until;
}

export function stepPlayerResources(/** @type {any} */ player, /** @type {any} */ now, /** @type {any} */ dt) {
  if (!player) return;
  const resourceDef = getResourceForClass(player.classId);
  if (!resourceDef) return;
  if (!Number.isFinite(player.resourceMax)) {
    const derived = computeDerivedStats(player);
    player.resourceMax = resourceDef.type === 'mana' ? derived.maxMana : (resourceDef.max ?? 0);
  }
  if (!player.resourceType) {
    player.resourceType = resourceDef.type ?? null;
  }

  let resource = player.resource ?? 0;
  const inCombat = (player.combatTagUntil ?? 0) > now;

  if (resourceDef.type === 'stamina') {
    const regen = inCombat
      ? resourceDef.regenInCombat ?? 0
      : resourceDef.regenOutOfCombat ?? 0;
    resource += regen * dt;
  } else if (resourceDef.type === 'rage') {
    if (!inCombat && Number.isFinite(resourceDef.decayOutOfCombat)) {
      resource -= resourceDef.decayOutOfCombat * dt;
    }
  } else if (resourceDef.type === 'focus') {
    const moving = !!player.movedThisTick;
    const regen = moving ? resourceDef.regenMoving ?? 0 : resourceDef.regenStanding ?? 0;
    resource += regen * dt;
  } else if (resourceDef.type === 'mana') {
    const derived = computeDerivedStats(player);
    resource += derived.manaRegen * dt;
  }

  const maxResource = player.resourceMax ?? (resourceDef.type === 'mana' ? computeDerivedStats(player).maxMana : resourceDef.max ?? 0);
  resource = clamp(resource, 0, maxResource);
  player.resource = resource;

  const stanceActive = player.defensiveStanceUntil && player.defensiveStanceUntil > now;
  if (stanceActive && resource <= 0) {
    player.defensiveStanceUntil = 0;
    player.moveSpeedMultiplier = 1;
    player.damageTakenMultiplier = 1;
  } else if (stanceActive) {
    player.moveSpeedMultiplier = 0.8;
    player.damageTakenMultiplier = 0.7;
  } else {
    player.moveSpeedMultiplier = 1;
    player.damageTakenMultiplier = 1;
  }

  const shieldWallActive = (player.shieldWallUntil ?? 0) > now;
  if (shieldWallActive) {
    player.damageTakenMultiplier = player.shieldWallDamageTakenMultiplier ?? 0.5;
  }

  if ((player.fortifyUntil ?? 0) <= now && (player.fortifyBaseMaxHp ?? 0) > 0) {
    const base = player.fortifyBaseMaxHp;
    player.maxHp = base;
    player.fortifyBaseMaxHp = 0;
    if ((player.hp ?? 0) > base) player.hp = base;
  }
}
