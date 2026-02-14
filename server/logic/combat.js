import {
  addXp,
  calculateMobXp,
  getMobXpBaseAndMult,
  partyBonus,
} from '../../shared/progression.js';
import { getPartyForPlayer } from './party.js';
import {
  getClassById,
  getAbilitiesForClass,
  getResourceForClass,
} from '../../shared/classes.js';
import { COMBAT_CONFIG } from '../../shared/config.js';
import { getEquippedWeapon } from '../../shared/equipment.js';
import { computeDerivedStats, computeHitChance } from '../../shared/attributes.js';
import { getMobMaxHp } from './mobs.js';
import { applyCollisions } from './collision.js';

export function getBasicAttackConfig(player) {
  const klass = getClassById(player?.classId);
  const weaponDef = getEquippedWeapon(player?.equipment, player?.classId);
  const range = Number.isFinite(weaponDef?.range) ? weaponDef.range : klass?.attackRange ?? 2.0;
  const attackType =
    weaponDef?.attackType ?? (range > 3 ? 'ranged' : 'melee');
  return {
    basePower: COMBAT_CONFIG.basicAttackDamage,
    cooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
    range,
    attackType,
  };
}

function getRelevantPower(derived, attackType) {
  if (attackType === 'melee') return derived.physicalPower;
  if (attackType === 'ranged') return derived.rangedPower;
  return derived.magicPower;
}

function getRelevantPowerForAbility(derived, ability, classId) {
  const magicClasses = ['mage', 'priest'];
  const magicAbilities = ['firebolt', 'frost_nova', 'smite'];
  if (magicAbilities.includes(ability?.id) || (magicClasses.includes(classId) && ability?.id !== 'basic_attack')) {
    return derived.magicPower;
  }
  const attackType = ability?.attackType;
  if (attackType === 'melee') return derived.physicalPower;
  if (attackType === 'ranged') return derived.rangedPower;
  return derived.magicPower;
}

function computeAbilityDamage(player, ability) {
  const basePower = (ability.damageBase ?? 0) + (ability.damagePerLevel ?? 0) * (player.level ?? 1);
  const derived = computeDerivedStats(player);
  const relevantPower = getRelevantPowerForAbility(derived, ability, player.classId);
  let damage = computeOutgoingDamage(Math.max(0, basePower), relevantPower);
  const isCrit = rollCrit(derived.critChance);
  if (isCrit) {
    damage = Math.floor(damage * 2);
  }
  return { damage, derived, isCrit };
}

function computeOutgoingDamage(basePower, relevantPower) {
  return Math.max(0, Math.floor(basePower * (1 + relevantPower / 100)));
}

function rollHit(attackerAccuracy, targetEvasion) {
  const hitChance = computeHitChance(attackerAccuracy, targetEvasion);
  return Math.random() < hitChance;
}

function rollCrit(critChance) {
  return Math.random() < critChance;
}

function distance2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function getMobDisplayName(mob) {
  if (!mob) return 'Enemy';
  const level = mob.level ?? 1;
  return `Enemy (Lv.${level})`;
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

const XP_RANGE_METERS = 35;
const XP_RANGE2 = XP_RANGE_METERS * XP_RANGE_METERS;
const DAMAGE_ELIGIBILITY_PCT = 0.10;
const ANTI_BOOST_GAP = 3;
const ANTI_BOOST_RATE = 0.08;

function applyDamageToMob({ mob, damage, attacker, now, respawnMs, players }) {
  if (!mob) return { xpGain: 0, leveledUp: false, killed: false, xpGainByPlayer: [] };
  if (!Number.isFinite(mob.maxHp)) {
    mob.maxHp = getMobMaxHp(mob.level ?? 1);
  }
  if (!Number.isFinite(mob.hp)) {
    mob.hp = mob.maxHp;
  }

  const dmg = Math.max(0, Math.floor(damage));
  if (attacker?.id && dmg > 0) {
    mob.damageBy = mob.damageBy ?? {};
    mob.damageBy[attacker.id] = (mob.damageBy[attacker.id] ?? 0) + dmg;
  }
  mob.hp = Math.max(0, mob.hp - dmg);

  let xpGainByPlayer = [];
  let killed = false;
  if (mob.hp <= 0) {
    mob.dead = true;
    mob.state = 'dead';
    mob.targetId = null;
    mob.respawnAt = now + (respawnMs ?? 10_000);
    killed = true;

    if (attacker?.targetId === mob.id) {
      attacker.targetId = null;
      attacker.targetKind = null;
    }

    const party = players?.get ? getPartyForPlayer(attacker?.id, players) : null;
    const usePartyXp = party && party.memberIds.length >= 2;

    if (usePartyXp && players) {
      const { baseXp, mult } = getMobXpBaseAndMult(mob.level ?? 1, attacker?.level ?? 1);
      const totalXpPool = Math.floor(baseXp * mult * partyBonus(party.memberIds.length));
      const mobPos = mob.pos ?? mob;
      const damageThreshold = (mob.maxHp ?? 0) * DAMAGE_ELIGIBILITY_PCT;
      const totalDamage = Object.values(mob.damageBy ?? {}).reduce((s, v) => s + v, 0);
      const totalSupport = Object.values(mob.supportBy ?? {}).reduce((s, v) => s + v, 0);

      const eligible = [];
      for (const pid of party.memberIds) {
        const p = players.get(pid);
        if (!p || p.dead) continue;
        const dx = (p.pos?.x ?? 0) - (mobPos.x ?? 0);
        const dz = (p.pos?.z ?? 0) - (mobPos.z ?? 0);
        if (dx * dx + dz * dz > XP_RANGE2) continue;
        const dmgDealt = (mob.damageBy ?? {})[pid] ?? 0;
        const supportCount = (mob.supportBy ?? {})[pid] ?? 0;
        if (dmgDealt < damageThreshold && supportCount === 0) continue;
        eligible.push({
          playerId: pid,
          player: p,
          damageShare: totalDamage > 0 ? dmgDealt / totalDamage : 0,
          supportShare: totalSupport > 0 ? supportCount / totalSupport : 0,
        });
      }

      if (eligible.length > 0 && totalXpPool > 0) {
        const partyAvgLevel =
          eligible.reduce((s, e) => s + (e.player?.level ?? 1), 0) / eligible.length;
        let sumWeights = 0;
        for (const e of eligible) {
          e.weight = e.damageShare + 0.5 * e.supportShare;
          sumWeights += e.weight;
        }
        if (sumWeights > 0) {
          for (const e of eligible) {
            const xpShare = totalXpPool * (e.weight / sumWeights);
            const gap = Math.max(0, partyAvgLevel - (e.player?.level ?? 1) - ANTI_BOOST_GAP);
            const damp = Math.max(0.10, Math.min(1, 1 - ANTI_BOOST_RATE * gap));
            const xpFinal = Math.max(0, Math.floor(xpShare * damp));
            if (xpFinal > 0 && e.player) {
              const beforeLevel = e.player.level ?? 1;
              const result = addXp(
                { level: e.player.level ?? 1, xp: e.player.xp ?? 0 },
                xpFinal
              );
              e.player.level = result.level;
              e.player.xp = result.xp;
              xpGainByPlayer.push({
                playerId: e.playerId,
                xpGain: xpFinal,
                leveledUp: result.level > beforeLevel,
              });
              if (result.level > beforeLevel) {
                syncDerivedStatsOnLevelUp(e.player, true);
              }
            }
          }
        }
      }
    } else if (attacker) {
      const xpGain = calculateMobXp(mob.level ?? 1, attacker.level ?? 1);
      if (xpGain > 0) {
        const beforeLevel = attacker.level ?? 1;
        const result = addXp(
          { level: attacker.level ?? 1, xp: attacker.xp ?? 0 },
          xpGain
        );
        attacker.level = result.level;
        attacker.xp = result.xp;
        const leveledUp = result.level > beforeLevel;
        xpGainByPlayer = [{ playerId: attacker.id, xpGain, leveledUp }];
        if (leveledUp) syncDerivedStatsOnLevelUp(attacker, true);
      }
    }
  }

  const attackerEntry = xpGainByPlayer.find((e) => e.playerId === attacker?.id);
  return {
    xpGain: attackerEntry?.xpGain ?? 0,
    leveledUp: attackerEntry?.leveledUp ?? false,
    killed,
    xpGainByPlayer,
  };
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

export function tryBasicAttack({ player, mobs, now, respawnMs, players }) {
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

  const derived = computeDerivedStats(player);
  const relevantPower = getRelevantPower(derived, config.attackType);
  let damage = computeOutgoingDamage(config.basePower, relevantPower);
  const targetEvasion = 0;
  const hit = rollHit(derived.accuracy, targetEvasion);
  const isCrit = hit && rollCrit(derived.critChance);
  if (isCrit) {
    damage = Math.floor(damage * 2);
  }

  const damageResult = hit
    ? applyDamageToMob({
        mob: target,
        damage,
        attacker: player,
        now,
        respawnMs,
        players,
      })
    : { xpGain: 0, leveledUp: false, killed: false, xpGainByPlayer: [] };

  if (hit) {
    tagCombat(player, now);
    const resourceDef = getResourceForClass(player.classId);
    if (resourceDef?.type === 'rage' && Number.isFinite(resourceDef.gainOnHit)) {
      player.resource = clampResource(player, (player.resource ?? 0) + resourceDef.gainOnHit);
    }
  }

  syncDerivedStatsOnLevelUp(player, damageResult.leveledUp);

  const from = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
  const to = { x: target.pos.x, y: target.pos.y ?? 0, z: target.pos.z };
  const durationMs = config.attackType === 'ranged' ? 200 : 180;

  const basicAttackAbility = getAbilityForSlot(player, 1);
  const abilityName = basicAttackAbility?.name ?? 'Basic Attack';
  return {
    success: true,
    targetId: target.id,
    xpGain: damageResult.xpGain,
    leveledUp: damageResult.leveledUp,
    combatLog: hit
      ? {
          damageDealt: damage,
          targetName: getMobDisplayName(target),
          abilityName,
          isCrit,
          xpGain: damageResult.xpGain,
          leveledUp: damageResult.leveledUp,
          xpGainByPlayer: damageResult.xpGainByPlayer ?? [],
        }
      : null,
    event: {
      kind: 'basic_attack',
      attackType: config.attackType,
      attackerId: player.id,
      targetId: target.id,
      from,
      to,
      hit,
      durationMs,
    },
  };
}

function syncDerivedStatsOnLevelUp(player, leveledUp) {
  if (!leveledUp) return;
  const derived = computeDerivedStats(player);
  player.maxHp = derived.maxHp;
  if (player.hp > derived.maxHp) {
    player.hp = derived.maxHp;
  }
  const resourceDef = getResourceForClass(player.classId);
  if (resourceDef?.type === 'mana') {
    player.resourceMax = derived.maxMana;
    player.resource = Math.min(player.resource ?? 0, derived.maxMana);
  }
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

function applyCleave({ player, mobs, range, coneDegrees, ability, now, respawnMs, direction, players }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false };
  const dir = direction ?? getAbilityDirection(player, mobs);
  if (!dir) return { xpGain: 0, leveledUp: false, hit: false, noDirection: true };
  const { damage, derived } = computeAbilityDamage(player, ability);
  const halfAngle = (coneDegrees ?? 120) / 2;
  const cosThreshold = Math.cos((halfAngle * Math.PI) / 180);
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  const xpByPlayer = new Map();
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dx = mob.pos.x - player.pos.x;
    const dz = mob.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.0001 || dist > range) continue;
    const dot = (dx / dist) * dir.x + (dz / dist) * dir.z;
    if (dot < cosThreshold) continue;
    if (!rollHit(derived.accuracy, 0)) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs, players });
    if (result.xpGain) xpGain += result.xpGain;
    if (result.leveledUp) leveledUp = true;
    for (const p of result.xpGainByPlayer ?? []) {
      const cur = xpByPlayer.get(p.playerId) ?? { xpGain: 0, leveledUp: false };
      xpByPlayer.set(p.playerId, {
        xpGain: cur.xpGain + p.xpGain,
        leveledUp: cur.leveledUp || p.leveledUp,
      });
    }
    hit = true;
  }
  const xpGainByPlayer = Array.from(xpByPlayer.entries()).map(([playerId, v]) => ({
    playerId,
    xpGain: v.xpGain,
    leveledUp: v.leveledUp,
  }));
  return { xpGain, leveledUp, hit, xpGainByPlayer };
}

function applyNova({ player, mobs, radius, ability, slowPct, slowDurationMs, now, respawnMs, players }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false, killed: 0 };
  const { damage, derived } = computeAbilityDamage(player, ability);
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  let killed = 0;
  const xpByPlayer = new Map();
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dist = Math.hypot(mob.pos.x - player.pos.x, mob.pos.z - player.pos.z);
    if (dist > radius) continue;
    if (!rollHit(derived.accuracy, 0)) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs, players });
    if (slowPct) {
      mob.slowUntil = now + slowDurationMs;
      mob.slowMultiplier = Math.max(0, 1 - slowPct / 100);
    }
    if (result.xpGain) xpGain += result.xpGain;
    if (result.leveledUp) leveledUp = true;
    if (result.killed) killed += 1;
    for (const p of result.xpGainByPlayer ?? []) {
      const cur = xpByPlayer.get(p.playerId) ?? { xpGain: 0, leveledUp: false };
      xpByPlayer.set(p.playerId, {
        xpGain: cur.xpGain + p.xpGain,
        leveledUp: cur.leveledUp || p.leveledUp,
      });
    }
    hit = true;
  }
  const xpGainByPlayer = Array.from(xpByPlayer.entries()).map(([playerId, v]) => ({
    playerId,
    xpGain: v.xpGain,
    leveledUp: v.leveledUp,
  }));
  return { xpGain, leveledUp, hit, killed, xpGainByPlayer };
}

export function tryUseAbility({ player, slot, mobs, players, world, now, respawnMs }) {
  if (!player || player.dead) return { success: false };
  const ability = getAbilityForSlot(player, slot) ?? null;
  if (!ability) return { success: false, reason: 'unknown_ability' };
  if (player.cast) return { success: false, reason: 'casting' };
  if (ability.id === 'basic_attack') {
    return tryBasicAttack({ player, mobs, now, respawnMs, players });
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

  let combatLog = null;
  if (ability.id === 'shield_slam' && targetMob) {
    const { damage, derived, isCrit } = computeAbilityDamage(player, ability);
    const targetEvasion = 0;
    if (rollHit(derived.accuracy, targetEvasion)) {
      const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      hit = true;
      combatLog = {
        damageDealt: damage,
        targetName: getMobDisplayName(targetMob),
        abilityName: ability.name,
        isCrit,
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer,
      };
      syncDerivedStatsOnLevelUp(player, result.leveledUp);
    }
    if (hit && (!Number.isFinite(targetMob.stunImmuneUntil) || targetMob.stunImmuneUntil <= now)) {
      targetMob.stunnedUntil = now + (ability.stunDurationMs ?? 0);
      targetMob.stunImmuneUntil = now + (ability.stunImmunityMs ?? 0);
    }
  } else if (ability.id === 'defensive_stance') {
    player.defensiveStanceUntil = now + (ability.durationMs ?? 0);
    player.moveSpeedMultiplier = ability.moveSpeedMultiplier ?? 0.8;
    player.damageTakenMultiplier = ability.damageTakenMultiplier ?? 0.6;
  } else if (ability.id === 'power_strike' && targetMob) {
    const { damage: baseDmg, derived, isCrit } = computeAbilityDamage(player, ability);
    const damage = preResource > 80 ? Math.round(baseDmg * 1.2) : baseDmg;
    if (rollHit(derived.accuracy, 0)) {
      const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      hit = true;
      combatLog = {
        damageDealt: damage,
        targetName: getMobDisplayName(targetMob),
        abilityName: ability.name,
        isCrit,
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer,
      };
      syncDerivedStatsOnLevelUp(player, result.leveledUp);
    }
  } else if (ability.id === 'cleave') {
    const result = applyCleave({
      player,
      mobs,
      range: ability.range ?? 0,
      coneDegrees: ability.coneDegrees ?? 120,
      ability,
      now,
      respawnMs,
      direction: abilityDir,
      players,
    });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = result.hit;
    if (result.hit && (result.xpGain > 0 || result.leveledUp)) {
      combatLog = {
        targetName: 'Enemies',
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer ?? [],
      };
    }
    syncDerivedStatsOnLevelUp(player, result.leveledUp);
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
    const baseHeal = 18 + 2 * (player.level ?? 1);
    const derived = computeDerivedStats(player);
    const healAmount = Math.floor(baseHeal * (1 + derived.healingPower / 100));
    const maxHp = healTarget.maxHp ?? healTarget.hp ?? 0;
    healTarget.hp = clamp((healTarget.hp ?? 0) + healAmount, 0, maxHp);
    const healTargetName = healTarget === player ? 'yourself' : (healTarget.name ?? 'ally');
    combatLog = {
      healAmount,
      healTarget: healTargetName,
    };
    if (healTarget !== player && healTarget.targetKind === 'mob' && healTarget.targetId && (healTarget.combatTagUntil ?? 0) > now) {
      const supportMob = Array.isArray(mobs) ? mobs.find((m) => m.id === healTarget.targetId) : null;
      if (supportMob && !supportMob.dead && supportMob.hp > 0) {
        supportMob.supportBy = supportMob.supportBy ?? {};
        supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
      }
    }
  } else if (ability.id === 'smite' && targetMob) {
    const { damage, derived, isCrit } = computeAbilityDamage(player, ability);
    if (rollHit(derived.accuracy, 0)) {
      const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      hit = true;
      combatLog = {
        damageDealt: damage,
        targetName: getMobDisplayName(targetMob),
        abilityName: ability.name,
        isCrit,
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer,
      };
      syncDerivedStatsOnLevelUp(player, result.leveledUp);
      const weakenedPct = ability.weakenedPct ?? 15;
      targetMob.weakenedUntil = now + 4000;
      targetMob.weakenedMultiplier = Math.max(0, 1 - weakenedPct / 100);
    }
  } else if (ability.id === 'firebolt' && targetMob) {
    const { damage, derived, isCrit } = computeAbilityDamage(player, ability);
    if (rollHit(derived.accuracy, 0)) {
      const result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      hit = true;
      combatLog = {
        damageDealt: damage,
        targetName: getMobDisplayName(targetMob),
        abilityName: ability.name,
        isCrit,
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer,
      };
      syncDerivedStatsOnLevelUp(player, result.leveledUp);
      if (result.killed && player.classId === 'mage') {
        const refund = Math.floor((ability.resourceCost ?? 0) * 0.2);
        if (refund > 0) {
          player.resource = clampResource(player, (player.resource ?? 0) + refund);
        }
      }
    }
  } else if (ability.id === 'frost_nova') {
    const result = applyNova({
      player,
      mobs,
      players,
      radius: ability.radius ?? 0,
      ability,
      slowPct: ability.slowPct ?? 0,
      slowDurationMs: ability.durationMs ?? 3000,
      now,
      respawnMs,
    });
    xpGain = result.xpGain;
    leveledUp = result.leveledUp;
    hit = result.hit;
    if (result.hit && (result.xpGain > 0 || result.leveledUp)) {
      combatLog = {
        targetName: 'Enemies',
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        xpGainByPlayer: result.xpGainByPlayer ?? [],
      };
    }
    syncDerivedStatsOnLevelUp(player, result.leveledUp);
    if (result.killed > 0 && player.classId === 'mage') {
      const refund = Math.floor((ability.resourceCost ?? 0) * 0.15 * result.killed);
      if (refund > 0) {
        player.resource = clampResource(player, (player.resource ?? 0) + refund);
      }
    }
  }

  if (hit) {
    tagCombat(player, now);
  }

  return { success: true, xpGain, leveledUp, combatLog };
}

export function stepPlayerResources(player, now, dt) {
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
    player.damageTakenMultiplier = 0.6;
  } else {
    player.moveSpeedMultiplier = 1;
    player.damageTakenMultiplier = 1;
  }
}

export function stepPlayerCast(player, mobs, now, respawnMs, players) {
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
  let combatLog = null;
  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === cast.targetId) : null;
  if (target && !target.dead && target.hp > 0) {
    if (withinRange(player.pos, target.pos, ability.range ?? 0)) {
      const { damage, derived, isCrit } = computeAbilityDamage(player, ability);
      if (rollHit(derived.accuracy, 0)) {
        const result = applyDamageToMob({ mob: target, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        combatLog = {
          damageDealt: damage,
          targetName: getMobDisplayName(target),
          abilityName: ability.name,
          isCrit,
          xpGain: result.xpGain,
          leveledUp: result.leveledUp,
          xpGainByPlayer: result.xpGainByPlayer,
        };
        syncDerivedStatsOnLevelUp(player, result.leveledUp);
        tagCombat(player, now);
      }
    }
  }

  player.cast = null;
  return { xpGain, leveledUp, combatLog };
}
