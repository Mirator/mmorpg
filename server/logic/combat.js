import { addXp, calculateMobXp } from '../../shared/progression.js';
import {
  getClassById,
  getAbilitiesForClass,
  getResourceForClass,
} from '../../shared/classes.js';
import { COMBAT_CONFIG } from '../../shared/config.js';
import { getEquippedWeapon } from '../../shared/equipment.js';
import { getMobMaxHp } from './mobs.js';
import { applyCollisions } from './collision.js';

export function getBasicAttackConfig(player) {
  const klass = getClassById(player?.classId);
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const range = Number.isFinite(weaponDef?.range) ? weaponDef.range : klass?.attackRange ?? 2.0;
  const attackType =
    weaponDef?.attackType ?? (range > 3 ? 'ranged' : 'melee');
  return {
    damage: COMBAT_CONFIG.basicAttackDamage,
    cooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
    range,
    attackType,
  };
}

function distance2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

const COMBAT_TAG_MS = 5000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampResource(player, value) {
  let max = Number.isFinite(player?.resourceMax) ? player.resourceMax : 0;
  if (max <= 0) {
    const resourceDef = getResourceForClass(player?.classId);
    max = resourceDef?.max ?? 0;
  }
  return clamp(value ?? 0, 0, max);
}

function tagCombat(player, now) {
  if (!player) return;
  player.combatTagUntil = now + COMBAT_TAG_MS;
}

function getAbilityForSlot(player, slot) {
  if (!player) return null;
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const abilities = getAbilitiesForClass(player?.classId, player?.level ?? 1, weaponDef);
  return abilities.find((ability) => ability.slot === slot) ?? null;
}

function getAbilityById(player, abilityId) {
  if (!player) return null;
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const abilities = getAbilitiesForClass(player?.classId, player?.level ?? 1, weaponDef);
  return abilities.find((ability) => ability.id === abilityId) ?? null;
}

function getAbilityCooldownUntil(player, abilityId) {
  if (!player || !abilityId) return 0;
  return Number(player?.abilityCooldowns?.[abilityId]) || 0;
}

function setAbilityCooldown(player, abilityId, until) {
  if (!player || !abilityId) return;
  if (!player.abilityCooldowns || typeof player.abilityCooldowns !== 'object') {
    player.abilityCooldowns = {};
  }
  player.abilityCooldowns[abilityId] = until;
}

function getDirectionFromTarget(player, mobs) {
  if (!player?.targetId) return null;
  if (player.targetKind && player.targetKind !== 'mob') return null;
  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) return null;
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= 0.0001) return null;
  return { x: dx / dist, z: dz / dist };
}

function getAbilityDirection(player, mobs) {
  const dirFromTarget = getDirectionFromTarget(player, mobs);
  if (dirFromTarget) return dirFromTarget;
  if (player?.lastMoveDir && Number.isFinite(player.lastMoveDir.x)) {
    const { x, z } = player.lastMoveDir;
    const dist = Math.hypot(x, z);
    if (dist > 0.0001) return { x: x / dist, z: z / dist };
  }
  return null;
}

function applyDamageToMob({ mob, damage, attacker, now, respawnMs }) {
  if (!mob) return { xpGain: 0, leveledUp: false, killed: false };
  if (!Number.isFinite(mob.maxHp)) {
    mob.maxHp = getMobMaxHp(mob.level ?? 1);
  }
  if (!Number.isFinite(mob.hp)) {
    mob.hp = mob.maxHp;
  }

  mob.hp = Math.max(0, mob.hp - Math.max(0, Math.floor(damage)));

  let xpGain = 0;
  let leveledUp = false;
  let killed = false;
  if (mob.hp <= 0) {
    mob.dead = true;
    mob.state = 'dead';
    mob.targetId = null;
    mob.respawnAt = now + (respawnMs ?? 10_000);
    killed = true;

    if (attacker) {
      if (attacker.targetId === mob.id) {
        attacker.targetId = null;
        attacker.targetKind = null;
      }
      xpGain = calculateMobXp(mob.level ?? 1, attacker.level ?? 1);
      if (xpGain > 0) {
        const beforeLevel = attacker.level ?? 1;
        const result = addXp(
          { level: attacker.level ?? 1, xp: attacker.xp ?? 0 },
          xpGain
        );
        attacker.level = result.level;
        attacker.xp = result.xp;
        leveledUp = attacker.level > beforeLevel;
      }
    }
  }

  return { xpGain, leveledUp, killed };
}

export function findNearestMobInRange(mobs, pos, range) {
  if (!Array.isArray(mobs) || !pos) return null;
  let best = null;
  let bestDist2 = range * range;
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dist2 = distance2(mob.pos ?? mob, pos);
    if (dist2 <= bestDist2) {
      best = mob;
      bestDist2 = dist2;
    }
  }
  return best;
}

export function tryBasicAttack({ player, mobs, now, respawnMs }) {
  if (!player || player.dead) return { success: false };
  const config = getBasicAttackConfig(player);
  if (now < (player.attackCooldownUntil ?? 0)) {
    return { success: false, reason: 'cooldown' };
  }

  if (!player.targetId || (player.targetKind && player.targetKind !== 'mob')) {
    return { success: false, reason: 'no_target' };
  }

  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) {
    player.targetId = null;
    player.targetKind = null;
    return { success: false, reason: 'no_target' };
  }

  const dist2 = distance2(target.pos ?? target, player.pos);
  if (dist2 > config.range * config.range) {
    return { success: false, reason: 'out_of_range' };
  }

  player.attackCooldownUntil = now + config.cooldownMs;
  const damageResult = applyDamageToMob({
    mob: target,
    damage: config.damage,
    attacker: player,
    now,
    respawnMs,
  });
  tagCombat(player, now);
  const resourceDef = getResourceForClass(player.classId);
  if (resourceDef?.type === 'rage' && Number.isFinite(resourceDef.gainOnHit)) {
    player.resource = clampResource(player, (player.resource ?? 0) + resourceDef.gainOnHit);
  }

  const from = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
  const to = { x: target.pos.x, y: target.pos.y ?? 0, z: target.pos.z };
  const durationMs = config.attackType === 'ranged' ? 200 : 180;

  return {
    success: true,
    targetId: target.id,
    xpGain: damageResult.xpGain,
    leveledUp: damageResult.leveledUp,
    event: {
      kind: 'basic_attack',
      attackType: config.attackType,
      attackerId: player.id,
      targetId: target.id,
      from,
      to,
      hit: true,
      durationMs,
    },
  };
}

function computeScaledValue(base, perLevel, level) {
  const raw = (base ?? 0) + (perLevel ?? 0) * (level ?? 1);
  return Math.max(0, Math.round(raw));
}

function resolveMobTarget(player, mobs) {
  if (!player?.targetId) return null;
  if (player.targetKind && player.targetKind !== 'mob') return null;
  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) return null;
  return target;
}

function resolvePlayerTarget(player, players) {
  if (!player?.targetId) return null;
  if (player.targetKind !== 'player') return null;
  const targetPlayer = players?.get?.(player.targetId);
  if (!targetPlayer || targetPlayer.dead) return null;
  return targetPlayer;
}

function withinRange(origin, target, range) {
  if (!origin || !target || !Number.isFinite(range)) return false;
  return distance2(origin, target) <= range * range;
}

function applyCleave({ player, mobs, range, coneDegrees, damage, now, respawnMs, direction }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false };
  const dir = direction ?? getAbilityDirection(player, mobs);
  if (!dir) return { xpGain: 0, leveledUp: false, hit: false, noDirection: true };
  const halfAngle = (coneDegrees ?? 120) / 2;
  const cosThreshold = Math.cos((halfAngle * Math.PI) / 180);
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dx = mob.pos.x - player.pos.x;
    const dz = mob.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.0001 || dist > range) continue;
    const dot = (dx / dist) * dir.x + (dz / dist) * dir.z;
    if (dot < cosThreshold) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs });
    if (result.xpGain) xpGain += result.xpGain;
    if (result.leveledUp) leveledUp = true;
    hit = true;
  }
  return { xpGain, leveledUp, hit };
}

function applyNova({ player, mobs, radius, damage, slowPct, slowDurationMs, now, respawnMs }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false };
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dist = Math.hypot(mob.pos.x - player.pos.x, mob.pos.z - player.pos.z);
    if (dist > radius) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs });
    if (slowPct) {
      mob.slowUntil = now + slowDurationMs;
      mob.slowMultiplier = Math.max(0, 1 - slowPct / 100);
    }
    if (result.xpGain) xpGain += result.xpGain;
    if (result.leveledUp) leveledUp = true;
    hit = true;
  }
  return { xpGain, leveledUp, hit };
}

export function tryUseAbility({ player, slot, mobs, players, world, now, respawnMs }) {
  if (!player || player.dead) return { success: false };
  const ability = getAbilityForSlot(player, slot) ?? null;
  if (!ability) return { success: false, reason: 'unknown_ability' };
  if (player.cast) return { success: false, reason: 'casting' };
  if (ability.id === 'basic_attack') {
    return tryBasicAttack({ player, mobs, now, respawnMs });
  }
  const cooldownUntil = getAbilityCooldownUntil(player, ability.id);
  if (now < cooldownUntil) return { success: false, reason: 'cooldown' };
  const cost = ability.resourceCost ?? 0;
  if (cost > 0 && (player.resource ?? 0) < cost) {
    return { success: false, reason: 'resource' };
  }
  const preResource = player.resource ?? 0;

  let targetMob = null;
  let targetPlayer = null;
  if (ability.targetType === 'targeted') {
    if (ability.targetKind === 'player') {
      targetPlayer = resolvePlayerTarget(player, players);
    } else {
      targetMob = resolveMobTarget(player, mobs);
    }
  }

  if (ability.id !== 'heal' && ability.targetType === 'targeted' && !targetMob) {
    return { success: false, reason: 'no_target' };
  }

  if (targetMob && !withinRange(player.pos, targetMob.pos, ability.range ?? 0)) {
    return { success: false, reason: 'out_of_range' };
  }
  if (targetPlayer && targetPlayer !== player && !withinRange(player.pos, targetPlayer.pos, ability.range ?? 0)) {
    return { success: false, reason: 'out_of_range' };
  }

  if (ability.id === 'aimed_shot') {
    if (!targetMob) return { success: false, reason: 'no_target' };
    player.cast = {
      id: ability.id,
      endsAt: now + (ability.windUpMs ?? 0),
      targetId: targetMob.id,
      targetKind: 'mob',
    };
    return { success: true, castStarted: true };
  }

  let abilityDir = null;
  if (ability.id === 'cleave' || ability.id === 'roll_back') {
    abilityDir = getAbilityDirection(player, mobs);
    if (!abilityDir) return { success: false, reason: 'no_direction' };
  }

  if (cost > 0) {
    player.resource = clampResource(player, (player.resource ?? 0) - cost);
  }
  setAbilityCooldown(player, ability.id, now + (ability.cooldownMs ?? 0));

  let xpGain = 0;
  let leveledUp = false;
  let hit = false;

  if (ability.id === 'shield_slam' && targetMob) {
    const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs });
    if (!Number.isFinite(targetMob.stunImmuneUntil) || targetMob.stunImmuneUntil <= now) {
      targetMob.stunnedUntil = now + (ability.stunDurationMs ?? 0);
      targetMob.stunImmuneUntil = now + (ability.stunImmunityMs ?? 0);
    }
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = true;
  } else if (ability.id === 'defensive_stance') {
    player.defensiveStanceUntil = now + (ability.durationMs ?? 0);
    player.moveSpeedMultiplier = ability.moveSpeedMultiplier ?? 0.8;
    player.damageTakenMultiplier = ability.damageTakenMultiplier ?? 0.6;
  } else if (ability.id === 'power_strike' && targetMob) {
    const baseDamage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const damage = preResource > 80 ? Math.round(baseDamage * 1.2) : baseDamage;
    const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = true;
  } else if (ability.id === 'cleave') {
    const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const result = applyCleave({
      player,
      mobs,
      range: ability.range ?? 0,
      coneDegrees: ability.coneDegrees ?? 120,
      damage,
      now,
      respawnMs,
      direction: abilityDir,
    });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = result.hit;
  } else if (ability.id === 'roll_back') {
    const dir = abilityDir;
    const distance = ability.dashDistance ?? 0;
    const nextPos = {
      x: player.pos.x - dir.x * distance,
      y: player.pos.y ?? 0,
      z: player.pos.z - dir.z * distance,
    };
    player.pos = applyCollisions(nextPos, world, 0.6);
    player.target = null;
    player.slowImmuneUntil = now + (ability.durationMs ?? 1000);
  } else if (ability.id === 'heal') {
    const healTarget = targetPlayer ?? player;
    const healAmount = 18 + 2 * (player.level ?? 1);
    const maxHp = healTarget.maxHp ?? healTarget.hp ?? 0;
    healTarget.hp = clamp((healTarget.hp ?? 0) + healAmount, 0, maxHp);
  } else if (ability.id === 'smite' && targetMob) {
    const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs });
    const weakenedPct = ability.weakenedPct ?? 15;
    targetMob.weakenedUntil = now + 4000;
    targetMob.weakenedMultiplier = Math.max(0, 1 - weakenedPct / 100);
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = true;
  } else if (ability.id === 'firebolt' && targetMob) {
    const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = true;
  } else if (ability.id === 'frost_nova') {
    const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
    const result = applyNova({
      player,
      mobs,
      radius: ability.radius ?? 0,
      damage,
      slowPct: ability.slowPct ?? 0,
      slowDurationMs: ability.durationMs ?? 3000,
      now,
      respawnMs,
    });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = result.hit;
  }

  if (hit) {
    tagCombat(player, now);
  }

  return { success: true, xpGain, leveledUp };
}

export function stepPlayerResources(player, now, dt) {
  if (!player) return;
  const resourceDef = getResourceForClass(player.classId);
  if (!resourceDef) return;
  if (!Number.isFinite(player.resourceMax)) {
    player.resourceMax = resourceDef.max ?? 0;
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
    if (Number.isFinite(resourceDef.regen)) {
      resource += resourceDef.regen * dt;
    } else {
      const regen = inCombat
        ? resourceDef.regenInCombat ?? 0
        : resourceDef.regenOutOfCombat ?? 0;
      resource += regen * dt;
    }
  }

  resource = clamp(resource, 0, player.resourceMax ?? resourceDef.max ?? 0);
  player.resource = resource;

  const stanceActive = player.defensiveStanceUntil && player.defensiveStanceUntil > now;
  if (stanceActive && resource <= 0) {
    player.defensiveStanceUntil = 0;
    player.moveSpeedMultiplier = 1;
    player.damageTakenMultiplier = 1;
  } else if (stanceActive) {
    player.moveSpeedMultiplier = 0.8;
    player.damageTakenMultiplier = 0.6;
  } else {
    player.moveSpeedMultiplier = 1;
    player.damageTakenMultiplier = 1;
  }
}

export function stepPlayerCast(player, mobs, now, respawnMs) {
  if (!player?.cast) return { xpGain: 0, leveledUp: false };
  const cast = player.cast;
  if (player.dead) {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }
  if (player.movedThisTick) {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }
  if (now < cast.endsAt) {
    return { xpGain: 0, leveledUp: false };
  }

  if (cast.id !== 'aimed_shot') {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }

  const ability = getAbilityById(player, cast.id);
  if (!ability) {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }

  const cost = ability.resourceCost ?? 0;
  if (cost > 0 && (player.resource ?? 0) < cost) {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }
  if (cost > 0) {
    player.resource = clampResource(player, (player.resource ?? 0) - cost);
  }
  setAbilityCooldown(player, ability.id, now + (ability.cooldownMs ?? 0));

  let xpGain = 0;
  let leveledUp = false;
  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === cast.targetId) : null;
  if (target && !target.dead && target.hp > 0) {
    if (withinRange(player.pos, target.pos, ability.range ?? 0)) {
      const damage = computeScaledValue(ability.damageBase, ability.damagePerLevel, player.level ?? 1);
      const result = applyDamageToMob({ mob: target, damage, attacker: player, now, respawnMs });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      tagCombat(player, now);
    }
  }

  player.cast = null;
  return { xpGain, leveledUp };
}
