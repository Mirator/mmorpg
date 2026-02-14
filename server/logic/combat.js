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
    baseValue: COMBAT_CONFIG.basicAttackBaseValue,
    coefficient: COMBAT_CONFIG.basicAttackCoefficient,
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

function applyPvpDamageMultiplier(damage, ability, isPvP) {
  if (!isPvP) return damage;
  const mult = ability?.pvpDamageMultiplier ?? 1.0;
  return Math.max(0, Math.floor(damage * mult));
}

function applyPvpHealMultiplier(heal, ability, isPvP) {
  if (!isPvP) return heal;
  const mult = ability?.pvpHealMultiplier ?? 1.0;
  return Math.max(0, Math.floor(heal * mult));
}

function applyPvpCCDurationMultiplier(durationMs, ability, isPvP) {
  if (!isPvP) return durationMs;
  const mult = ability?.pvpCCDurationMultiplier ?? 1.0;
  return Math.max(0, Math.floor(durationMs * mult));
}

/**
 * Damage = baseValue + (Relevant Power × coefficient)
 */
function computeAbilityDamage(player, ability, now = 0) {
  const baseValue = ability.baseValue ?? 0;
  const coefficient = ability.coefficient ?? 0;
  const derived = computeDerivedStats(player);
  let relevantPower = getRelevantPowerForAbility(derived, ability, player.classId);
  if ((player.avatarOfWarUntil ?? 0) > now && ability?.attackType === 'melee') {
    relevantPower = Math.floor(relevantPower * (player.physicalPowerMultiplier ?? 1.3));
  }
  let damage = Math.max(0, Math.floor(baseValue + relevantPower * coefficient));
  let critChance = derived.critChance ?? 0;
  if ((player.eagleEyeUntil ?? 0) > now) {
    critChance = Math.min(0.4, critChance + (player.critChanceBonusPct ?? 20) / 100);
  }
  const isCrit = rollCrit(critChance);
  if (isCrit) {
    damage = Math.floor(damage * 2);
  }
  if ((player.berserkUntil ?? 0) > now) {
    damage = Math.floor(damage * (player.damageDealtMultiplier ?? 1.25));
  }
  if ((player.bloodRageUntil ?? 0) > now) {
    damage = Math.floor(damage * (player.bloodRageDamageMultiplier ?? 1));
  }
  return { damage, derived, isCrit };
}

/**
 * Damage = baseValue + (Relevant Power × coefficient)
 */
function computeOutgoingDamage(baseValue, coefficient, relevantPower) {
  return Math.max(0, Math.floor(baseValue + relevantPower * coefficient));
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

  let dmg = Math.max(0, Math.floor(damage));
  if (attacker?.classId === 'ranger' && (mob.markedUntil ?? 0) > now && mob.markedByRangerId === attacker.id) {
    const pct = mob.markDamageBonusPct ?? 10;
    dmg = Math.floor(dmg * (1 + pct / 100));
  }
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

const GLOBAL_COOLDOWN_MS = COMBAT_CONFIG.globalCooldownMs ?? 900;
const CC_DR_WINDOW_MS = COMBAT_CONFIG.ccDrWindowMs ?? 10_000;

const CC_DR_MULTIPLIERS = [1.0, 0.5, 0.25, 0];

function applyCCWithDR(target, category, baseDurationMs, ability, isPvP, now) {
  const durationAfterPvp = applyPvpCCDurationMultiplier(baseDurationMs, ability, isPvP);
  if (durationAfterPvp <= 0) return 0;
  if (!target) return 0;
  const t = now ?? Date.now();
  target.ccHistory = target.ccHistory ?? { stun: [], root: [], slow: [] };
  const history = target.ccHistory[category];
  if (!Array.isArray(history)) return 0;
  const cutoff = t - CC_DR_WINDOW_MS;
  const recent = history.filter((ts) => ts > cutoff);
  const count = recent.length;
  const multiplier = CC_DR_MULTIPLIERS[Math.min(count, 3)];
  if (multiplier <= 0) return 0;
  const effectiveDuration = Math.floor(durationAfterPvp * multiplier);
  recent.push(t);
  target.ccHistory[category] = recent;
  return effectiveDuration;
}

export function tryBasicAttack({ player, mobs, now, respawnMs, players }) {
  if (!player || player.dead) return { success: false };
  const config = getBasicAttackConfig(player);
  if (now < (player.globalCooldownUntil ?? 0)) {
    return { success: false, reason: 'gcd' };
  }
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
  player.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;

  const derived = computeDerivedStats(player);
  const relevantPower = getRelevantPower(derived, config.attackType);
  let damage = computeOutgoingDamage(config.baseValue, config.coefficient, relevantPower);
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

function resolvePlayerTarget(player, players, allowDead = false) {
  if (!player?.targetId) return null;
  if (player.targetKind !== 'player') return null;
  const targetPlayer = players?.get?.(player.targetId);
  if (!targetPlayer) return null;
  if (!allowDead && targetPlayer.dead) return null;
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
  const { damage: rawDmg, derived } = computeAbilityDamage(player, ability, now);
  const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
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

function applyNova({ player, mobs, radius, ability, slowPct, slowDurationMs, rootDurationMs, now, respawnMs, players, center }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false, killed: 0 };
  const { damage: rawDmg, derived } = computeAbilityDamage(player, ability, now);
  const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
  const origin = center ?? player.pos;
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  let killed = 0;
  const xpByPlayer = new Map();
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dist = Math.hypot(mob.pos.x - origin.x, mob.pos.z - origin.z);
    if (dist > radius) continue;
    if (!rollHit(derived.accuracy, 0)) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs, players });
    if (rootDurationMs) {
      const effectiveRootDuration = applyCCWithDR(mob, 'root', rootDurationMs, ability, false, now);
      if (effectiveRootDuration > 0) {
        mob.rootedUntil = now + effectiveRootDuration;
      }
    }
    if (slowPct) {
      const effectiveSlowDuration = applyCCWithDR(mob, 'slow', slowDurationMs, ability, false, now);
      if (effectiveSlowDuration > 0) {
        mob.slowUntil = now + effectiveSlowDuration;
        mob.slowMultiplier = Math.max(0, 1 - slowPct / 100);
      }
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

export function tryUseAbility({ player, slot, mobs, players, world, now, respawnMs, placementX, placementZ }) {
  if (!player || player.dead) return { success: false };
  const ability = getAbilityForSlot(player, slot) ?? null;
  if (!ability) return { success: false, reason: 'unknown_ability' };
  if (player.cast) return { success: false, reason: 'casting' };
  if (now < (player.globalCooldownUntil ?? 0)) {
    return { success: false, reason: 'gcd' };
  }
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
      targetPlayer = resolvePlayerTarget(player, players, ability.id === 'salvation');
    } else {
      targetMob = resolveMobTarget(player, mobs);
    }
  }

  if (ability.targetType === 'targeted' && ability.targetKind === 'mob' && !targetMob) {
    return { success: false, reason: 'no_target' };
  }
  if (ability.targetType === 'targeted' && ability.targetKind === 'player' && ability.id !== 'heal' && !targetPlayer) {
    return { success: false, reason: 'no_target' };
  }

  if (targetMob && !withinRange(player.pos, targetMob.pos, ability.range ?? 0)) {
    return { success: false, reason: 'out_of_range' };
  }
  if (targetPlayer && targetPlayer !== player && !withinRange(player.pos, targetPlayer.pos, ability.range ?? 0)) {
    return { success: false, reason: 'out_of_range' };
  }

  if (ability.requirePlacement) {
    const px = Number(placementX);
    const pz = Number(placementZ);
    if (!Number.isFinite(px) || !Number.isFinite(pz)) {
      return { success: false, reason: 'no_placement' };
    }
    const placementRange = ability.placementRange ?? 10;
    const dx = px - (player.pos?.x ?? 0);
    const dz = pz - (player.pos?.z ?? 0);
    if (dx * dx + dz * dz > placementRange * placementRange) {
      return { success: false, reason: 'out_of_range' };
    }
  }

  if (ability.id === 'aimed_shot' || ability.id === 'rapid_fire' || ability.id === 'arcane_missiles') {
    if (!targetMob) return { success: false, reason: 'no_target' };
    if (!ability.exemptFromGCD) {
      player.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
    }
    const windUp = ability.windUpMs ?? (ability.id === 'aimed_shot' ? 600 : 1500);
    player.cast = {
      id: ability.id,
      endsAt: now + windUp,
      startedAt: now,
      targetId: targetMob.id,
      targetKind: 'mob',
      firedTicks: 0,
    };
    return { success: true, castStarted: true };
  }

  let abilityDir = null;
  if (ability.id === 'cleave' || ability.id === 'roll_back' || ability.id === 'whirlwind' || ability.id === 'flame_wave') {
    abilityDir = getAbilityDirection(player, mobs);
    if (!abilityDir) return { success: false, reason: 'no_direction' };
  }

  const placementCenter =
    ability.requirePlacement && Number.isFinite(placementX) && Number.isFinite(placementZ)
      ? { x: placementX, y: player.pos?.y ?? 0, z: placementZ }
      : null;

  if (ability.consumeAllRage) {
    player.resource = 0;
  } else if (cost > 0) {
    player.resource = clampResource(player, (player.resource ?? 0) - cost);
  }
  setAbilityCooldown(player, ability.id, now + (ability.cooldownMs ?? 0));
  if (!ability.exemptFromGCD) {
    player.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
  }

  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  let combatLog = null;

  const handler = ABILITY_HANDLERS[ability.id];
  if (handler) {
    const result = handler({
      player,
      ability,
      targetMob,
      targetPlayer,
      mobs,
      players,
      world,
      now,
      respawnMs,
      abilityDir,
      preResource,
      placementCenter,
    });
    xpGain = result.xpGain ?? 0;
    leveledUp = result.leveledUp ?? false;
    hit = result.hit ?? false;
    if (result.combatLog) combatLog = result.combatLog;
    syncDerivedStatsOnLevelUp(player, leveledUp);
  }

  if (hit) {
    tagCombat(player, now);
  }

  const event = buildAbilityEvent({
    player,
    ability,
    targetMob,
    targetPlayer,
    abilityDir,
    placementCenter,
  });
  return { success: true, xpGain, leveledUp, combatLog, event };
}

function buildAbilityEvent({ player, ability, targetMob, targetPlayer, abilityDir, placementCenter }) {
  if (!player || !ability) return null;
  const from = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
  const center = placementCenter ?? from;
  const to = targetMob?.pos
    ? { x: targetMob.pos.x, y: targetMob.pos.y ?? 0, z: targetMob.pos.z }
    : targetPlayer?.pos
      ? { x: targetPlayer.pos.x, y: targetPlayer.pos.y ?? 0, z: targetPlayer.pos.z }
      : null;
  const dir = abilityDir ?? (to ? { x: to.x - from.x, z: to.z - from.z } : { x: 0, z: 1 });
  const dist = Math.hypot(dir.x, dir.z) || 1;
  const direction = { x: dir.x / dist, z: dir.z / dist };
  const durationMs = 400;

  const event = {
    kind: 'ability',
    abilityId: ability.id,
    attackerId: player.id,
    from,
    durationMs,
  };

  const targetedRanged = [
    'firebolt',
    'smite',
    'aimed_shot',
    'poison_arrow',
    'disengage_shot',
    'rapid_fire',
    'arcane_missiles',
  ];
  const targetedMelee = [
    'shield_slam',
    'power_strike',
    'execute',
    'interrupting_strike',
    'guardians_rebuke',
  ];
  const coneAoE = ['cleave', 'whirlwind', 'flame_wave'];
  const radiusAoE = ['frost_nova', 'ground_slam', 'meteor', 'snare_trap'];
  const placementAoE = ['snare_trap', 'meteor', 'prayer_of_light'];
  const selfBuffs = [
    'berserk',
    'defensive_stance',
    'shield_wall',
    'fortify',
    'blood_rage',
    'avatar_of_war',
    'unbreakable',
    'eagle_eye',
    'ice_barrier',
  ];
  const movement = ['roll_back', 'blink'];
  const heals = ['heal', 'renew', 'divine_shield', 'cleanse', 'silence', 'salvation', 'mark_target'];

  if (targetedRanged.includes(ability.id) && to) {
    return { ...event, to, effectType: 'projectile' };
  }
  if (targetedMelee.includes(ability.id) && to) {
    return { ...event, to, effectType: 'slash' };
  }
  if (coneAoE.includes(ability.id)) {
    return {
      ...event,
      center: from,
      direction,
      coneDegrees: ability.coneDegrees ?? 120,
      range: ability.range ?? 2.5,
      effectType: 'cone',
    };
  }
  if (radiusAoE.includes(ability.id)) {
    return {
      ...event,
      center: placementCenter ? { x: placementCenter.x, y: placementCenter.y ?? 0, z: placementCenter.z } : from,
      radius: ability.radius ?? 2.5,
      effectType: 'nova',
    };
  }
  if (ability.id === 'prayer_of_light') {
    return {
      ...event,
      center: placementCenter ? { x: placementCenter.x, y: placementCenter.y ?? 0, z: placementCenter.z } : from,
      radius: ability.radius ?? 5,
      effectType: 'healRing',
    };
  }
  if (selfBuffs.includes(ability.id)) {
    return { ...event, center: from, effectType: 'buffAura' };
  }
  if (movement.includes(ability.id) && abilityDir) {
    const dashDist = ability.dashDistance ?? 3;
    const sign = ability.id === 'roll_back' ? -1 : 1;
    const toPos = {
      x: from.x + abilityDir.x * dashDist * sign,
      y: from.y,
      z: from.z + abilityDir.z * dashDist * sign,
    };
    return { ...event, to: toPos, effectType: 'dashTrail' };
  }
  if (heals.includes(ability.id) && (to || ability.targetType === 'self')) {
    const healTo = to ?? from;
    return { ...event, to: healTo, effectType: 'projectile' };
  }
  if (['counterspell', 'taunt'].includes(ability.id) && to) {
    return { ...event, to, effectType: 'projectile' };
  }
  if (to) {
    return { ...event, to, effectType: 'projectile' };
  }
  return event;
}

function createAbilityHandlers() {
  return {
    shield_slam(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
      }
      if (hit && (!Number.isFinite(targetMob.stunImmuneUntil) || targetMob.stunImmuneUntil <= now)) {
        const stunDuration = applyCCWithDR(targetMob, 'stun', ability.stunDurationMs ?? 0, ability, false, now);
        if (stunDuration > 0) {
          targetMob.stunnedUntil = now + stunDuration;
          targetMob.stunImmuneUntil = now + (ability.stunImmunityMs ?? 0);
        }
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    defensive_stance(ctx) {
      const { player, ability } = ctx;
      player.defensiveStanceUntil = ctx.now + (ability.durationMs ?? 0);
      player.moveSpeedMultiplier = ability.moveSpeedMultiplier ?? 0.8;
      player.damageTakenMultiplier = ability.damageTakenMultiplier ?? 0.6;
      return {};
    },
    power_strike(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs, preResource } = ctx;
      if (!targetMob) return {};
      const { damage: baseDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const scaledDmg = preResource > 80 ? Math.round(baseDmg * 1.2) : baseDmg;
      const damage = applyPvpDamageMultiplier(scaledDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    cleave(ctx) {
      const { player, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = applyCleave({
        player,
        mobs,
        range: ctx.ability.range ?? 0,
        coneDegrees: ctx.ability.coneDegrees ?? 120,
        ability: ctx.ability,
        now,
        respawnMs,
        direction: abilityDir,
        players,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    roll_back(ctx) {
      const { player, ability, world, abilityDir } = ctx;
      const dir = abilityDir;
      const distance = ability.dashDistance ?? 0;
      const nextPos = {
        x: player.pos.x - dir.x * distance,
        y: player.pos.y ?? 0,
        z: player.pos.z - dir.z * distance,
      };
      player.pos = applyCollisions(nextPos, world, 0.6);
      player.target = null;
      player.slowImmuneUntil = ctx.now + (ability.durationMs ?? 1000);
      return {};
    },
    heal(ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const healTarget = targetPlayer ?? player;
      const baseValue = ability.baseValue ?? 15;
      const coefficient = ability.coefficient ?? 0.9;
      const derived = computeDerivedStats(player);
      const rawHeal = Math.max(0, Math.floor(baseValue + derived.healingPower * coefficient));
      const isPvPHeal = healTarget !== player && targetPlayer != null;
      const healAmount = applyPvpHealMultiplier(rawHeal, ability, isPvPHeal);
      const maxHp = healTarget.maxHp ?? healTarget.hp ?? 0;
      healTarget.hp = clamp((healTarget.hp ?? 0) + healAmount, 0, maxHp);
      const healTargetName = healTarget === player ? 'yourself' : (healTarget.name ?? 'ally');
      if (
        ability.supportTag &&
        healTarget !== player &&
        healTarget.targetKind === 'mob' &&
        healTarget.targetId &&
        (healTarget.combatTagUntil ?? 0) > now
      ) {
        const supportMob = Array.isArray(mobs) ? mobs.find((m) => m.id === healTarget.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          healAmount,
          healTarget: healTargetName,
        },
      };
    },
    renew(ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const healTarget = targetPlayer ?? player;
      const derived = computeDerivedStats(player);
      const totalHeal = (ability.baseValue ?? 8) + derived.healingPower * (ability.coefficient ?? 0.4);
      const ticks = ability.hotTicks ?? 8;
      const healPerTick = Math.max(1, Math.floor(totalHeal / ticks));
      healTarget.hotTicksRemaining = ticks;
      healTarget.hotHealPerTick = healPerTick;
      healTarget.hotSourceId = player.id;
      healTarget.hotNextTickAt = ctx.now + DOT_TICK_MS;
      if (ability.supportTag && healTarget !== player && healTarget.targetId && (healTarget.combatTagUntil ?? 0) > now) {
        const supportMob = Array.isArray(mobs) ? mobs.find((m) => m.id === healTarget.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          healAmount: totalHeal,
          healTarget: healTarget === player ? 'yourself' : (healTarget.name ?? 'ally'),
        },
      };
    },
    cleanse(ctx) {
      const { targetPlayer } = ctx;
      const target = targetPlayer ?? ctx.player;
      target.dotTicksRemaining = 0;
      target.dotUntil = 0;
      target.dotSourceId = null;
      target.slowUntil = 0;
      target.slowMultiplier = 1;
      target.weakenedUntil = 0;
      target.weakenedMultiplier = 1;
      target.rootedUntil = 0;
      return { hit: true };
    },
    divine_shield(ctx) {
      const { player, ability, targetPlayer, mobs, now } = ctx;
      const target = targetPlayer ?? player;
      const derived = computeDerivedStats(player);
      const absorb = Math.max(0, Math.floor((ability.baseValue ?? 20) + derived.healingPower * (ability.coefficient ?? 0.8)));
      target.absorbAmount = absorb;
      target.absorbUntil = ctx.now + 30000;
      if (ability.supportTag && target !== player && target.targetId && (target.combatTagUntil ?? 0) > now) {
        const supportMob = Array.isArray(mobs) ? mobs.find((m) => m.id === target.targetId) : null;
        if (supportMob && !supportMob.dead && supportMob.hp > 0) {
          supportMob.supportBy = supportMob.supportBy ?? {};
          supportMob.supportBy[player.id] = (supportMob.supportBy[player.id] ?? 0) + 1;
        }
      }
      return {
        combatLog: {
          absorbAmount: absorb,
          healTarget: target === player ? 'yourself' : (target.name ?? 'ally'),
        },
      };
    },
    prayer_of_light(ctx) {
      const { player, ability, players, mobs, now, placementCenter } = ctx;
      const derived = computeDerivedStats(player);
      const rawHeal = Math.max(0, Math.floor((ability.baseValue ?? 12) + derived.healingPower * (ability.coefficient ?? 0.5)));
      const radius = ability.radius ?? 5;
      const origin = placementCenter ?? player.pos;
      const playerArr = players instanceof Map ? Array.from(players.values()) : players;
      let totalHealed = 0;
      for (const p of playerArr ?? []) {
        if (!p || p.dead) continue;
        const dist = Math.hypot((p.pos?.x ?? 0) - (origin?.x ?? 0), (p.pos?.z ?? 0) - (origin?.z ?? 0));
        if (dist > radius) continue;
        const isPvP = p !== player;
        const heal = applyPvpHealMultiplier(rawHeal, ability, isPvP);
        p.hp = Math.min((p.hp ?? 0) + heal, p.maxHp ?? 100);
        totalHealed += heal;
      }
      return {
        combatLog: totalHealed > 0 ? { healAmount: totalHealed, healTarget: 'party' } : null,
      };
    },
    silence(ctx) {
      const { targetPlayer } = ctx;
      const target = targetPlayer ?? ctx.player;
      target.castingLockoutUntil = ctx.now + (ctx.ability.interruptLockoutMs ?? 2000);
      return { hit: true };
    },
    salvation(ctx) {
      const { player, ability, targetPlayer } = ctx;
      if (!targetPlayer || !targetPlayer.dead) return {};
      targetPlayer.hp = Math.floor((targetPlayer.maxHp ?? 100) * 0.5);
      targetPlayer.dead = false;
      targetPlayer.respawnAt = 0;
      return {
        combatLog: {
          healAmount: targetPlayer.hp,
          healTarget: targetPlayer.name ?? 'ally',
          revived: true,
        },
      };
    },
    smite(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, ctx.now);
    const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
    let hit = false;
    let xpGain = 0;
    let leveledUp = false;
    let result = null;
    if (rollHit(derived.accuracy, 0)) {
      result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now: ctx.now, respawnMs, players });
      xpGain = result.xpGain;
      leveledUp = result.leveledUp;
      hit = true;
      const weakenedPct = ability.weakenedPct ?? 15;
        targetMob.weakenedUntil = now + 4000;
        targetMob.weakenedMultiplier = Math.max(0, 1 - weakenedPct / 100);
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    firebolt(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        if (result.killed && player.classId === 'mage') {
          const refund = Math.floor((ability.resourceCost ?? 0) * 0.2);
          if (refund > 0) {
            player.resource = clampResource(player, (player.resource ?? 0) + refund);
          }
        }
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    berserk(ctx) {
      const { player, ability } = ctx;
      player.berserkUntil = ctx.now + (ability.durationMs ?? 6000);
      player.damageDealtMultiplier = ability.damageDealtMultiplier ?? 1.25;
      return {};
    },
    whirlwind(ctx) {
      const { player, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = applyCleave({
        player,
        mobs,
        range: ctx.ability.range ?? 2.5,
        coneDegrees: 360,
        ability: ctx.ability,
        now,
        respawnMs,
        direction: abilityDir,
        players,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    execute(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const hpPct = (targetMob.hp ?? 0) / Math.max(1, targetMob.maxHp ?? 1);
      const { damage: baseDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const executeBonus = hpPct < (ability.executeThresholdPct ?? 30) / 100 ? 1.5 : 1;
      const damage = applyPvpDamageMultiplier(Math.floor(baseDmg * executeBonus), ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    blood_rage(ctx) {
      const { player, ability } = ctx;
      const consumedRage = ctx.preResource ?? 0;
      player.bloodRageUntil = ctx.now + (ability.durationMs ?? 6000);
      player.bloodRageDamageMultiplier = 1 + consumedRage * 0.02;
      return {};
    },
    interrupting_strike(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        targetMob.castingLockoutUntil = now + (ability.interruptLockoutMs ?? 2000);
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    avatar_of_war(ctx) {
      const { player, ability } = ctx;
      player.avatarOfWarUntil = ctx.now + (ability.durationMs ?? 10000);
      player.physicalPowerMultiplier = ability.physicalPowerMultiplier ?? 1.3;
      return {};
    },
    taunt(ctx) {
      const { player, ability, targetMob } = ctx;
      if (!targetMob) return {};
      targetMob.targetId = player.id;
      targetMob.tauntedUntil = ctx.now + (ability.durationMs ?? 3000);
      return {};
    },
    shield_wall(ctx) {
      const { player, ability } = ctx;
      player.shieldWallUntil = ctx.now + (ability.durationMs ?? 3000);
      player.shieldWallDamageTakenMultiplier = ability.damageTakenMultiplier ?? 0.5;
      return {};
    },
    fortify(ctx) {
      const { player, ability } = ctx;
      const baseMaxHp = player.maxHp ?? 100;
      const mult = ability.maxHpMultiplier ?? 1.2;
      const newMaxHp = Math.floor(baseMaxHp * mult);
      const bonusHp = Math.floor(baseMaxHp * (mult - 1));
      player.fortifyBaseMaxHp = baseMaxHp;
      player.maxHp = newMaxHp;
      player.hp = Math.min((player.hp ?? baseMaxHp) + bonusHp, newMaxHp);
      player.fortifyUntil = ctx.now + (ability.durationMs ?? 8000);
      return {};
    },
    ground_slam(ctx) {
      const { player, ability, mobs, players, now, respawnMs } = ctx;
      const result = applyNova({
        player,
        mobs,
        players,
        radius: ability.radius ?? 2.5,
        ability,
        slowPct: ability.slowPct ?? 40,
        slowDurationMs: ability.durationMs ?? 3000,
        now,
        respawnMs,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    guardians_rebuke(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        targetMob.castingLockoutUntil = now + (ability.interruptLockoutMs ?? 2000);
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    unbreakable(ctx) {
      const { player, ability } = ctx;
      player.ccImmuneUntil = ctx.now + (ability.durationMs ?? 4000);
      return {};
    },
    poison_arrow(ctx) {
      const { player, ability, targetMob, now, respawnMs, players } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        const ticks = ability.dotTicks ?? 6;
        const derivedStats = computeDerivedStats(player);
        const power = derivedStats.rangedPower ?? 0;
        const totalDotDmg = (ability.baseValue ?? 6) + power * (ability.coefficient ?? 0.2);
        const dotDmgPerTick = Math.max(1, Math.floor(totalDotDmg / ticks));
        targetMob.dotTicksRemaining = ticks;
        targetMob.dotDamagePerTick = dotDmgPerTick;
        targetMob.dotSourceId = player.id;
        targetMob.dotNextTickAt = now + DOT_TICK_MS;
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    snare_trap(ctx) {
      const { player, ability, mobs, players, now, respawnMs, placementCenter } = ctx;
      const result = applyNova({
        player,
        mobs,
        radius: ability.radius ?? 2.5,
        ability,
        rootDurationMs: ability.rootDurationMs ?? 2000,
        now,
        respawnMs,
        players,
        center: placementCenter,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    mark_target(ctx) {
      const { player, ability, targetMob } = ctx;
      if (!targetMob) return {};
      targetMob.markedByRangerId = player.id;
      targetMob.markedUntil = ctx.now + (ability.durationMs ?? 10000);
      targetMob.markDamageBonusPct = ability.markDamageBonusPct ?? 10;
      return { hit: true };
    },
    disengage_shot(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      let hit = false;
      let xpGain = 0;
      let leveledUp = false;
      let result = null;
      if (rollHit(derived.accuracy, 0)) {
        result = applyDamageToMob({ mob: targetMob, damage, attacker: player, now, respawnMs, players });
        xpGain = result.xpGain;
        leveledUp = result.leveledUp;
        hit = true;
        const kb = ability.knockbackDistance ?? 2;
        const dx = targetMob.pos.x - player.pos.x;
        const dz = targetMob.pos.z - player.pos.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const nx = dx / dist;
        const nz = dz / dist;
        targetMob.pos.x += nx * kb;
        targetMob.pos.z += nz * kb;
      }
      return {
        xpGain,
        leveledUp,
        hit,
        combatLog: hit
          ? {
              damageDealt: damage,
              targetName: getMobDisplayName(targetMob),
              abilityName: ability.name,
              isCrit,
              xpGain,
              leveledUp,
              xpGainByPlayer: result?.xpGainByPlayer,
            }
          : null,
      };
    },
    eagle_eye(ctx) {
      const { player, ability } = ctx;
      player.eagleEyeUntil = ctx.now + (ability.durationMs ?? 8000);
      player.critChanceBonusPct = ability.critChanceBonusPct ?? 20;
      return {};
    },
    flame_wave(ctx) {
      const { player, ability, mobs, players, now, respawnMs, abilityDir } = ctx;
      const result = applyCleave({
        player,
        mobs,
        range: ability.range ?? 5,
        coneDegrees: ability.coneDegrees ?? 90,
        ability,
        now,
        respawnMs,
        direction: abilityDir,
        players,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    ice_barrier(ctx) {
      const { player, ability } = ctx;
      const derived = computeDerivedStats(player);
      const absorb = Math.max(0, Math.floor((ability.baseValue ?? 25) + derived.magicPower * (ability.coefficient ?? 0.9)));
      player.absorbAmount = absorb;
      player.absorbUntil = ctx.now + 60000;
      return {};
    },
    blink(ctx) {
      const { player, ability, world, abilityDir } = ctx;
      const dir = abilityDir ?? (player.lastMoveDir ?? { x: 0, z: 1 });
      const dist = ability.dashDistance ?? 4;
      const nextPos = {
        x: player.pos.x + dir.x * dist,
        y: player.pos.y ?? 0,
        z: player.pos.z + dir.z * dist,
      };
      player.pos = applyCollisions(nextPos, world, 0.6);
      return {};
    },
    counterspell(ctx) {
      const { player, ability, targetMob, mobs, players, now, respawnMs } = ctx;
      if (!targetMob) return {};
      targetMob.castingLockoutUntil = now + (ability.interruptLockoutMs ?? 2000);
      return { hit: true };
    },
    meteor(ctx) {
      const { player, ability, mobs, players, now, respawnMs, placementCenter } = ctx;
      const result = applyNova({
        player,
        mobs,
        radius: ability.radius ?? 4,
        ability,
        now,
        respawnMs,
        players,
        center: placementCenter,
      });
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
    frost_nova(ctx) {
      const { player, ability, mobs, players, now, respawnMs } = ctx;
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
      if (result.killed > 0 && player.classId === 'mage') {
        const refund = Math.floor((ability.resourceCost ?? 0) * 0.15 * result.killed);
        if (refund > 0) {
          player.resource = clampResource(player, (player.resource ?? 0) + refund);
        }
      }
      return {
        xpGain: result.xpGain,
        leveledUp: result.leveledUp,
        hit: result.hit,
        combatLog:
          result.hit && (result.xpGain > 0 || result.leveledUp)
            ? {
                targetName: 'Enemies',
                xpGain: result.xpGain,
                leveledUp: result.leveledUp,
                xpGainByPlayer: result.xpGainByPlayer ?? [],
              }
            : null,
      };
    },
  };
}

const ABILITY_HANDLERS = createAbilityHandlers();

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

function fireChannelTick(player, ability, target, mobs, now, respawnMs, players) {
  if (!target || target.dead || target.hp <= 0) return { xpGain: 0, leveledUp: false, combatLog: null };
  if (!withinRange(player.pos, target.pos, ability.range ?? 0)) return { xpGain: 0, leveledUp: false, combatLog: null };
  const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
  const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
  if (!rollHit(derived.accuracy, 0)) return { xpGain: 0, leveledUp: false, combatLog: null };
  const result = applyDamageToMob({ mob: target, damage, attacker: player, now, respawnMs, players });
  syncDerivedStatsOnLevelUp(player, result.leveledUp);
  tagCombat(player, now);
  return {
    xpGain: result.xpGain,
    leveledUp: result.leveledUp,
    combatLog: {
      damageDealt: damage,
      targetName: getMobDisplayName(target),
      abilityName: ability.name,
      isCrit,
      xpGain: result.xpGain,
      leveledUp: result.leveledUp,
      xpGainByPlayer: result.xpGainByPlayer,
    },
  };
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
  if ((player.castingLockoutUntil ?? 0) > now) {
    return { xpGain: 0, leveledUp: false };
  }

  const ability = getAbilityById(player, cast.id);
  if (!ability) {
    player.cast = null;
    return { xpGain: 0, leveledUp: false };
  }

  if (cast.id === 'rapid_fire' || cast.id === 'arcane_missiles') {
    const tickInterval = (ability.windUpMs ?? 1500) / (ability.channelTicks ?? 3);
    const firedTicks = cast.firedTicks ?? 0;
    const startedAt = cast.startedAt ?? now;
    let xpGain = 0;
    let leveledUp = false;
    let combatLog = null;
    const target = Array.isArray(mobs) ? mobs.find((m) => m.id === cast.targetId) : null;
    let newFired = firedTicks;
    while (newFired < (ability.channelTicks ?? 3) && now >= startedAt + (newFired + 1) * tickInterval) {
      const tickResult = fireChannelTick(player, ability, target, mobs, now, respawnMs, players);
      xpGain += tickResult.xpGain ?? 0;
      if (tickResult.leveledUp) leveledUp = true;
      if (tickResult.combatLog) combatLog = tickResult.combatLog;
      newFired++;
    }
    cast.firedTicks = newFired;
    if (newFired >= (ability.channelTicks ?? 3)) {
      const cost = ability.resourceCost ?? 0;
      if (cost > 0) {
        player.resource = clampResource(player, (player.resource ?? 0) - cost);
      }
      setAbilityCooldown(player, ability.id, now + (ability.cooldownMs ?? 0));
      player.cast = null;
      const event = buildAbilityEvent({
        player,
        ability,
        targetMob: target,
        targetPlayer: null,
        abilityDir: null,
        placementCenter: null,
      });
      return { xpGain, leveledUp, combatLog, event };
    }
    return { xpGain, leveledUp, combatLog };
  }

  if (now < cast.endsAt) {
    return { xpGain: 0, leveledUp: false };
  }

  if (cast.id !== 'aimed_shot') {
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
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
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
  const event = buildAbilityEvent({
    player,
    ability,
    targetMob: target,
    targetPlayer: null,
    abilityDir: null,
    placementCenter: null,
  });
  return { xpGain, leveledUp, combatLog, event };
}

const DOT_TICK_MS = 1000;

export function stepDotTicks(mobs, now, respawnMs, players) {
  if (!Array.isArray(mobs)) return;
  for (const mob of mobs) {
    if (!mob || mob.dead || (mob.dotTicksRemaining ?? 0) <= 0) continue;
    if (now < (mob.dotNextTickAt ?? 0)) continue;
    const dmg = mob.dotDamagePerTick ?? 0;
    const sourceId = mob.dotSourceId;
    const attacker = players?.get?.(sourceId) ?? null;
    applyDamageToMob({ mob, damage: dmg, attacker, now, respawnMs, players });
    mob.dotTicksRemaining = (mob.dotTicksRemaining ?? 1) - 1;
    mob.dotNextTickAt = now + DOT_TICK_MS;
    if (mob.dotTicksRemaining <= 0) {
      mob.dotUntil = 0;
      mob.dotSourceId = null;
      mob.dotDamagePerTick = null;
    }
  }
}

export function stepHotTicks(players, now) {
  if (!players) return;
  const arr = players instanceof Map ? Array.from(players.values()) : players;
  for (const target of arr) {
    if (!target || target.dead || (target.hotTicksRemaining ?? 0) <= 0) continue;
    if (now < (target.hotNextTickAt ?? 0)) continue;
    const heal = target.hotHealPerTick ?? 0;
    target.hp = Math.min((target.hp ?? 0) + heal, target.maxHp ?? 100);
    target.hotTicksRemaining = (target.hotTicksRemaining ?? 1) - 1;
    target.hotNextTickAt = now + DOT_TICK_MS;
    if (target.hotTicksRemaining <= 0) {
      target.hotUntil = 0;
      target.hotSourceId = null;
      target.hotHealPerTick = null;
    }
  }
}
