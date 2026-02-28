// @ts-check
import {
  addXp,
  calculateMobXp,
  getMobXpBaseAndMult,
  partyBonus,
} from '../../shared/progression.js';
import { getPartyForPlayer } from './party.js';
import {
  getClassById,
  getResourceForClass,
} from '../../shared/classes.js';
import { COMBAT_CONFIG } from '../../shared/config.js';
import { applyDurabilityLoss, getEquippedWeapon } from '../../shared/equipment.js';
import { computeDerivedStats } from '../../shared/attributes.js';
import { getMobMaxHp } from './mobs.js';
import { getMobDisplayName as resolveMobDisplayName, getMobStats } from '../../shared/entityTypes.js';
import { applyCollisions } from './collision.js';
import { isPvPAllowed } from './pvp.js';
import { createAbilityHandlers } from './combat/abilityHandlers.js';
import {
  applyPvpCCDurationMultiplier,
  applyPvpDamageMultiplier,
  applyPvpHealMultiplier,
  clamp,
  clampResource,
  computeAbilityDamage,
  computeOutgoingDamage,
  getAbilityById,
  getAbilityCooldownUntil,
  getAbilityForSlot,
  getRelevantPower,
  rollCrit,
  rollHit,
  setAbilityCooldown,
} from './combat/calculations.js';
import {
  applyFacingDirection,
  distance2,
  getDirectionBetweenPoints,
  makeDamageImpactForTarget,
  makeHealImpactForTarget,
  normalizeImpacts,
  resolveCastFacingDirection,
} from './combat/primitives.js';
import { rollAndGrantLoot } from './loot.js';
import { applyContractProgress } from './contracts.js';

// Ownership boundary: this module is the server-authoritative combat rules engine.
// Transport/session concerns belong in WS/HTTP layers, not in combat logic.

export function getBasicAttackConfig(/** @type {any} */ player) {
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

const COMBAT_TAG_MS = 5000;

function getMobDisplayName(/** @type {any} */ mob) {
  return resolveMobDisplayName(mob?.mobType);
}

function tagCombat(/** @type {any} */ player, /** @type {any} */ now) {
  if (!player) return;
  player.combatTagUntil = now + COMBAT_TAG_MS;
}

function getDirectionFromTarget(/** @type {any} */ player, /** @type {any} */ mobs) {
  if (!player?.targetId) return null;
  if (player.targetKind && player.targetKind !== 'mob') return null;
  const target = Array.isArray(mobs) ? mobs.find((/** @type {any} */ mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) return null;
  const dx = target.pos.x - player.pos.x;
  const dz = target.pos.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= 0.0001) return null;
  return { x: dx / dist, z: dz / dist };
}

function getAbilityDirection(/** @type {any} */ player, /** @type {any} */ mobs) {
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

let /** @type {any} */ _lootContext = null;

export function setLootContext(/** @type {any} */ ctx) {
  _lootContext = ctx ?? null;
}

function applyDamageToMob(/** @type {any} */ { mob, damage, attacker, now, respawnMs, players }) {
  const lootContext = _lootContext;
  if (!mob) return { xpGain: 0, leveledUp: false, killed: false, xpGainByPlayer: [] };
  if (!Number.isFinite(mob.maxHp)) {
    mob.maxHp = getMobMaxHp(mob.level ?? 1, mob.mobType);
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

  let /** @type {any} */ xpGainByPlayer = [];
  let killed = false;
  if (mob.hp <= 0) {
    mob.dead = true;
    mob.state = 'dead';
    mob.targetId = null;
    const mobRespawnMs = mob.mobType ? getMobStats(mob.mobType).respawnMs : (respawnMs ?? 10_000);
    mob.respawnAt = now + mobRespawnMs;
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
      const totalDamage = Object.values(mob.damageBy ?? {}).reduce((/** @type {any} */ s, /** @type {any} */ v) => s + v, 0);
      const totalSupport = Object.values(mob.supportBy ?? {}).reduce((/** @type {any} */ s, /** @type {any} */ v) => s + v, 0);

      const /** @type {any} */ eligible = [];
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
          weight: 0,
        });
      }

      if (eligible.length > 0 && totalXpPool > 0) {
        const partyAvgLevel =
          eligible.reduce((/** @type {any} */ s, /** @type {any} */ e) => s + (e.player?.level ?? 1), 0) / eligible.length;
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

    if (attacker && lootContext?.nextItemIdRef) {
      const stackMax = Number.isFinite(attacker.invStackMax) ? attacker.invStackMax : 20;
      rollAndGrantLoot(
        mob,
        attacker,
        lootContext.nextItemIdRef,
        lootContext.rand,
        stackMax
      );
    }

    if (attacker) {
      if (applyDurabilityLoss(attacker.equipment?.weapon, 1)) {
        attacker.pendingProgressDirty = true;
      }
      const contractProgress = applyContractProgress(attacker, {
        kind: 'hunt',
        target: mob.mobType ?? 'orc',
        count: 1,
      });
      if (contractProgress.changed) {
        attacker.pendingProgressDirty = true;
      }
    }
  }

  const attackerEntry = xpGainByPlayer.find((/** @type {any} */ e) => e.playerId === attacker?.id);
  return {
    xpGain: attackerEntry?.xpGain ?? 0,
    leveledUp: attackerEntry?.leveledUp ?? false,
    killed,
    xpGainByPlayer,
  };
}

const DIED_IN_PVP_MS = 60_000;

function applyDamageToPlayer(/** @type {any} */ { targetPlayer, damage, attacker, now }) {
  if (!targetPlayer || targetPlayer.dead) return { killed: false, damageDealt: 0 };
  let dmg = Math.max(0, Math.floor(damage));
  let mult = 1;
  if ((targetPlayer.shieldWallUntil ?? 0) > now) {
    mult = targetPlayer.shieldWallPvpDamageTakenMultiplier ?? 0.7;
  } else if ((targetPlayer.defensiveStanceUntil ?? 0) > now) {
    mult = targetPlayer.defensiveStancePvpDamageTakenMultiplier ?? 0.8;
  }
  dmg = Math.floor(dmg * mult);
  const maxHp = targetPlayer.maxHp ?? targetPlayer.hp ?? 100;
  targetPlayer.hp = Math.max(0, (targetPlayer.hp ?? maxHp) - dmg);
  let killed = false;
  if (targetPlayer.hp <= 0) {
    targetPlayer.dead = true;
    targetPlayer.respawnAt = now + 5000;
    targetPlayer.diedInPvPUntil = now + DIED_IN_PVP_MS;
    killed = true;
    if (attacker?.targetId === targetPlayer.id) {
      attacker.targetId = null;
      attacker.targetKind = null;
    }
  }
  return { killed, damageDealt: dmg };
}

export function findNearestMobInRange(/** @type {any} */ mobs, /** @type {any} */ pos, /** @type {any} */ range) {
  if (!Array.isArray(mobs) || !pos) return null;
  let /** @type {any} */ best = null;
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

const /** @type {any} */ CC_DR_MULTIPLIERS = [1.0, 0.5, 0.25, 0];

function applyCCWithDR(/** @type {any} */ target, /** @type {any} */ category, /** @type {any} */ baseDurationMs, /** @type {any} */ ability, /** @type {any} */ isPvP, /** @type {any} */ now) {
  const durationAfterPvp = applyPvpCCDurationMultiplier(baseDurationMs, ability, isPvP);
  if (durationAfterPvp <= 0) return 0;
  if (!target) return 0;
  const t = now ?? Date.now();
  target.ccHistory = target.ccHistory ?? { stun: [], root: [], slow: [] };
  const history = target.ccHistory[category];
  if (!Array.isArray(history)) return 0;
  const cutoff = t - CC_DR_WINDOW_MS;
  const recent = history.filter((/** @type {any} */ ts) => ts > cutoff);
  const count = recent.length;
  const multiplier = CC_DR_MULTIPLIERS[Math.min(count, 3)];
  if (multiplier <= 0) return 0;
  const effectiveDuration = Math.floor(durationAfterPvp * multiplier);
  recent.push(t);
  target.ccHistory[category] = recent;
  return effectiveDuration;
}

export function tryBasicAttack(/** @type {any} */ { player, mobs, now, respawnMs, players }) {
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

  const target = Array.isArray(mobs) ? mobs.find((/** @type {any} */ mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) {
    player.targetId = null;
    player.targetKind = null;
    return { success: false, reason: 'no_target' };
  }

  const dist2 = distance2(target.pos ?? target, player.pos);
  if (dist2 > config.range * config.range) {
    return { success: false, reason: 'out_of_range' };
  }
  applyFacingDirection(player, getDirectionBetweenPoints(player.pos, target.pos));

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

  const /** @type {any} */ from = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
  const /** @type {any} */ to = { x: target.pos.x, y: target.pos.y ?? 0, z: target.pos.z };
  const durationMs = config.attackType === 'ranged' ? 200 : 180;
  const /** @type {any} */ impacts = [];
  if (hit) {
    const impact = makeDamageImpactForTarget(target, damage, isCrit, target.id, 'mob');
    if (impact) impacts.push(impact);
  }

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
      ...(impacts.length > 0 ? { impacts } : {}),
    },
  };
}

function syncDerivedStatsOnLevelUp(/** @type {any} */ player, /** @type {any} */ leveledUp) {
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

function computeScaledValue(/** @type {any} */ base, /** @type {any} */ perLevel, /** @type {any} */ level) {
  const raw = (base ?? 0) + (perLevel ?? 0) * (level ?? 1);
  return Math.max(0, Math.round(raw));
}

function resolveMobTarget(/** @type {any} */ player, /** @type {any} */ mobs) {
  if (!player?.targetId) return null;
  if (player.targetKind && player.targetKind !== 'mob') return null;
  const target = Array.isArray(mobs) ? mobs.find((/** @type {any} */ mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) return null;
  return target;
}

function resolvePlayerTarget(/** @type {any} */ player, /** @type {any} */ players, /** @type {any} */ allowDead = false) {
  if (!player?.targetId) return null;
  if (player.targetKind !== 'player') return null;
  const targetPlayer = players?.get?.(player.targetId);
  if (!targetPlayer) return null;
  if (!allowDead && targetPlayer.dead) return null;
  return targetPlayer;
}

function withinRange(/** @type {any} */ origin, /** @type {any} */ target, /** @type {any} */ range) {
  if (!origin || !target || !Number.isFinite(range)) return false;
  return distance2(origin, target) <= range * range;
}

function applyCleave(/** @type {any} */ { player, mobs, range, coneDegrees, ability, now, respawnMs, direction, players }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false, impacts: [] };
  const dir = direction ?? getAbilityDirection(player, mobs);
  if (!dir) return { xpGain: 0, leveledUp: false, hit: false, noDirection: true, impacts: [] };
  const halfAngle = (coneDegrees ?? 120) / 2;
  const cosThreshold = Math.cos((halfAngle * Math.PI) / 180);
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  const xpByPlayer = new Map();
  const /** @type {any} */ impacts = [];
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dx = mob.pos.x - player.pos.x;
    const dz = mob.pos.z - player.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= 0.0001 || dist > range) continue;
    const dot = (dx / dist) * dir.x + (dz / dist) * dir.z;
    if (dot < cosThreshold) continue;
    const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now, false);
    const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
    if (!rollHit(derived.accuracy, 0)) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs, players });
    const impact = makeDamageImpactForTarget(mob, damage, isCrit, mob.id, 'mob');
    if (impact) impacts.push(impact);
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
  if (players?.forEach) {
    players.forEach((/** @type {any} */ targetPlayer) => {
      if (!targetPlayer || targetPlayer.dead || targetPlayer.id === player.id) return;
      if (!isPvPAllowed(player, targetPlayer, {})) return;
      const dx = (targetPlayer.pos?.x ?? 0) - player.pos.x;
      const dz = (targetPlayer.pos?.z ?? 0) - player.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 0.0001 || dist > range) return;
      const dot = (dx / dist) * dir.x + (dz / dist) * dir.z;
      if (dot < cosThreshold) return;
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now, true);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, true);
      if (!rollHit(derived.accuracy, 0)) return;
      applyDamageToPlayer({ targetPlayer, damage, attacker: player, now });
      const impact = makeDamageImpactForTarget(targetPlayer, damage, isCrit, targetPlayer.id, 'player');
      if (impact) impacts.push(impact);
      hit = true;
    });
  }
  const xpGainByPlayerArr = Array.from(xpByPlayer.entries()).map((/** @type {any} */ [playerId, v]) => ({
    playerId,
    xpGain: v.xpGain,
    leveledUp: v.leveledUp,
  }));
  return { xpGain, leveledUp, hit, xpGainByPlayer: xpGainByPlayerArr, impacts };
}

function applyNova(/** @type {any} */ { player, mobs, radius, ability, slowPct, slowDurationMs, rootDurationMs, now, respawnMs, players, center }) {
  if (!player || !Array.isArray(mobs)) return { xpGain: 0, leveledUp: false, hit: false, killed: 0, impacts: [] };
  const origin = center ?? player.pos;
  let xpGain = 0;
  let leveledUp = false;
  let hit = false;
  let killed = 0;
  const xpByPlayer = new Map();
  const /** @type {any} */ impacts = [];
  const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now, false);
  const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
  for (const mob of mobs) {
    if (!mob || mob.dead || mob.hp <= 0) continue;
    const dist = Math.hypot(mob.pos.x - origin.x, mob.pos.z - origin.z);
    if (dist > radius) continue;
    if (!rollHit(derived.accuracy, 0)) continue;
    const result = applyDamageToMob({ mob, damage, attacker: player, now, respawnMs, players });
    const impact = makeDamageImpactForTarget(mob, damage, isCrit, mob.id, 'mob');
    if (impact) impacts.push(impact);
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
  if (players?.forEach) {
    const { damage: pvpDmg, derived: pvpDerived, isCrit: pvpCrit } = computeAbilityDamage(player, ability, now, true);
    const pvpDamage = applyPvpDamageMultiplier(pvpDmg, ability, true);
    players.forEach((/** @type {any} */ targetPlayer) => {
      if (!targetPlayer || targetPlayer.dead || targetPlayer.id === player.id) return;
      if (!isPvPAllowed(player, targetPlayer, {})) return;
      const dist = Math.hypot(
        (targetPlayer.pos?.x ?? 0) - origin.x,
        (targetPlayer.pos?.z ?? 0) - origin.z
      );
      if (dist > radius) return;
      if (!rollHit(pvpDerived.accuracy, 0)) return;
      applyDamageToPlayer({ targetPlayer, damage: pvpDamage, attacker: player, now });
      const impact = makeDamageImpactForTarget(targetPlayer, pvpDamage, pvpCrit, targetPlayer.id, 'player');
      if (impact) impacts.push(impact);
      if (rootDurationMs) {
        const effectiveRootDuration = applyCCWithDR(targetPlayer, 'root', rootDurationMs, ability, true, now);
        if (effectiveRootDuration > 0) {
          targetPlayer.rootedUntil = now + effectiveRootDuration;
        }
      }
      if (slowPct) {
        const effectiveSlowDuration = applyCCWithDR(targetPlayer, 'slow', slowDurationMs, ability, true, now);
        if (effectiveSlowDuration > 0) {
          targetPlayer.slowUntil = now + effectiveSlowDuration;
          targetPlayer.slowMultiplier = Math.max(0, 1 - slowPct / 100);
        }
      }
      hit = true;
    });
  }
  const xpGainByPlayer = Array.from(xpByPlayer.entries()).map((/** @type {any} */ [playerId, v]) => ({
    playerId,
    xpGain: v.xpGain,
    leveledUp: v.leveledUp,
  }));
  return { xpGain, leveledUp, hit, killed, xpGainByPlayer, impacts };
}

export function tryUseAbility(/** @type {any} */ { player, slot, mobs, players, world, now, respawnMs, placementX, placementZ }) {
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

  let /** @type {any} */ targetMob = null;
  let /** @type {any} */ targetPlayer = null;
  if (ability.targetType === 'targeted') {
    if (ability.targetKind === 'player') {
      targetPlayer = resolvePlayerTarget(player, players, ability.id === 'salvation');
    } else if (ability.targetKind === 'any') {
      if (player.targetKind === 'player') {
        targetPlayer = resolvePlayerTarget(player, players, false);
      } else {
        targetMob = resolveMobTarget(player, mobs);
      }
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
  if (ability.targetType === 'targeted' && ability.targetKind === 'any' && !targetMob && !targetPlayer) {
    return { success: false, reason: 'no_target' };
  }
  if (targetPlayer && targetPlayer !== player && ability.targetKind === 'any' && !isPvPAllowed(player, targetPlayer, {})) {
    return { success: false, reason: 'pvp_not_allowed' };
  }
  if (ability.id === 'salvation' && targetPlayer?.dead && (targetPlayer.diedInPvPUntil ?? 0) > now) {
    return { success: false, reason: 'salvation_pve_only' };
  }

  const effectiveRange =
    (player.repositionedUntil ?? 0) > now && ability.attackType === 'ranged'
      ? (ability.range ?? 0) + 2
      : (ability.range ?? 0);

  if (targetMob && !withinRange(player.pos, targetMob.pos, effectiveRange)) {
    return { success: false, reason: 'out_of_range' };
  }
  if (targetPlayer && targetPlayer !== player && !withinRange(player.pos, targetPlayer.pos, effectiveRange)) {
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
    applyFacingDirection(
      player,
      resolveCastFacingDirection({
        player,
        abilityDir: null,
        targetMob,
        targetPlayer: null,
        placementCenter: null,
      })
    );
    if (!ability.exemptFromGCD) {
      player.globalCooldownUntil = now + GLOBAL_COOLDOWN_MS;
    }
    let windUp = ability.windUpMs ?? (ability.id === 'aimed_shot' ? 600 : 1500);
    if (ability.id === 'arcane_missiles' && (targetMob?.chilledUntil ?? 0) > now) {
      windUp = Math.max(800, windUp - 400);
    }
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

  let /** @type {any} */ abilityDir = null;
  if (ability.id === 'cleave' || ability.id === 'roll_back' || ability.id === 'whirlwind' || ability.id === 'flame_wave') {
    abilityDir = getAbilityDirection(player, mobs);
    if (!abilityDir) return { success: false, reason: 'no_direction' };
  }

  const placementCenter =
    ability.requirePlacement && Number.isFinite(placementX) && Number.isFinite(placementZ)
      ? { x: placementX, y: player.pos?.y ?? 0, z: placementZ }
      : null;
  applyFacingDirection(
    player,
    resolveCastFacingDirection({
      player,
      abilityDir,
      targetMob,
      targetPlayer,
      placementCenter,
    })
  );

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
  let /** @type {any} */ combatLog = null;
  let /** @type {any} */ impacts = [];

  const handler = ABILITY_HANDLERS[ability.id];
  if (handler) {
    const result = /** @type {any} */ (handler({
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
    }));
    xpGain = result.xpGain ?? 0;
    leveledUp = result.leveledUp ?? false;
    hit = result.hit ?? false;
    if (result.combatLog) combatLog = result.combatLog;
    impacts = normalizeImpacts(result.impacts);
    if (
      impacts.length === 0 &&
      hit &&
      Number.isFinite(result?.combatLog?.damageDealt) &&
      (targetMob || targetPlayer)
    ) {
      const fallbackTarget = targetPlayer ?? targetMob;
      const targetKind = targetPlayer ? 'player' : 'mob';
      const impact = makeDamageImpactForTarget(
        fallbackTarget,
        result.combatLog.damageDealt,
        result.combatLog.isCrit,
        fallbackTarget?.id,
        targetKind
      );
      if (impact) impacts.push(impact);
    }
    if (
      impacts.length === 0 &&
      Number.isFinite(result?.combatLog?.healAmount) &&
      (ability.id === 'heal' || ability.id === 'salvation')
    ) {
      const healTarget = targetPlayer ?? player;
      const impact = makeHealImpactForTarget(
        healTarget,
        result.combatLog.healAmount,
        healTarget?.id,
        'player'
      );
      if (impact) impacts.push(impact);
    }
    syncDerivedStatsOnLevelUp(player, leveledUp);
  }

  if (hit) {
    tagCombat(player, now);
    if ((player.berserkEmpoweredHits ?? 0) > 0 && (ability.baseValue ?? 0) > 0) {
      player.berserkEmpoweredHits = Math.max(0, (player.berserkEmpoweredHits ?? 0) - 1);
    }
    if ((player.repositionedUntil ?? 0) > now && ability.attackType === 'ranged' && (ability.baseValue ?? 0) > 0) {
      player.repositionedUntil = 0;
    }
  }

  const event = buildAbilityEvent({
    player,
    ability,
    targetMob,
    targetPlayer,
    abilityDir,
    placementCenter,
  });
  if (event) {
    event.hit = !!hit;
    if (impacts.length > 0) {
      event.impacts = impacts;
    }
  }
  return { success: true, xpGain, leveledUp, combatLog, event };
}

function buildAbilityEvent(/** @type {any} */ { player, ability, targetMob, targetPlayer, abilityDir, placementCenter }) {
  if (!player || !ability) return null;
  const /** @type {any} */ from = { x: player.pos.x, y: player.pos.y ?? 0, z: player.pos.z };
  const center = placementCenter ?? from;
  const to = targetMob?.pos
    ? { x: targetMob.pos.x, y: targetMob.pos.y ?? 0, z: targetMob.pos.z }
    : targetPlayer?.pos
      ? { x: targetPlayer.pos.x, y: targetPlayer.pos.y ?? 0, z: targetPlayer.pos.z }
      : null;
  const dir = abilityDir ?? (to ? { x: to.x - from.x, z: to.z - from.z } : { x: 0, z: 1 });
  const dist = Math.hypot(dir.x, dir.z) || 1;
  const /** @type {any} */ direction = { x: dir.x / dist, z: dir.z / dist };
  const durationMs = 400;

  const /** @type {any} */ event = {
    kind: 'ability',
    abilityId: ability.id,
    attackerId: player.id,
    from,
    durationMs,
  };

  const /** @type {any} */ targetedRanged = [
    'firebolt',
    'smite',
    'aimed_shot',
    'poison_arrow',
    'disengage_shot',
    'rapid_fire',
    'arcane_missiles',
  ];
  const /** @type {any} */ targetedMelee = [
    'shield_slam',
    'power_strike',
    'execute',
    'interrupting_strike',
    'guardians_rebuke',
  ];
  const /** @type {any} */ coneAoE = ['cleave', 'whirlwind', 'flame_wave'];
  const /** @type {any} */ radiusAoE = ['frost_nova', 'ground_slam', 'meteor', 'snare_trap'];
  const /** @type {any} */ placementAoE = ['snare_trap', 'meteor', 'prayer_of_light'];
  const /** @type {any} */ selfBuffs = [
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
  const /** @type {any} */ movement = ['roll_back', 'blink'];
  const /** @type {any} */ heals = ['heal', 'renew', 'divine_shield', 'cleanse', 'silence', 'salvation', 'mark_target'];

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
    const /** @type {any} */ toPos = {
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

const DOT_TICK_MS = 1000;

const ABILITY_HANDLERS = createAbilityHandlers({
  computeAbilityDamage,
  applyPvpDamageMultiplier,
  applyPvpHealMultiplier,
  applyDamageToMob,
  applyDamageToPlayer,
  rollHit,
  getMobDisplayName,
  applyCCWithDR,
  applyCleave,
  applyNova,
  clampResource,
  clamp,
  computeDerivedStats,
  isPvPAllowed,
  applyCollisions,
  DOT_TICK_MS,
});

export { stepPlayerResources } from './combat/calculations.js';

function fireChannelTick(/** @type {any} */ player, /** @type {any} */ ability, /** @type {any} */ target, /** @type {any} */ mobs, /** @type {any} */ now, /** @type {any} */ respawnMs, /** @type {any} */ players) {
  if (!target || target.dead || target.hp <= 0) return { xpGain: 0, leveledUp: false, combatLog: null, impacts: [] };
  if (!withinRange(player.pos, target.pos, ability.range ?? 0)) return { xpGain: 0, leveledUp: false, combatLog: null, impacts: [] };
  const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
  const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
  if (!rollHit(derived.accuracy, 0)) return { xpGain: 0, leveledUp: false, combatLog: null, impacts: [] };
  const result = applyDamageToMob({ mob: target, damage, attacker: player, now, respawnMs, players });
  syncDerivedStatsOnLevelUp(player, result.leveledUp);
  tagCombat(player, now);
  const /** @type {any} */ impacts = [];
  const impact = makeDamageImpactForTarget(target, damage, isCrit, target.id, 'mob');
  if (impact) impacts.push(impact);
  return {
    xpGain: result.xpGain,
    leveledUp: result.leveledUp,
    impacts,
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

export function stepPlayerCast(/** @type {any} */ player, /** @type {any} */ mobs, /** @type {any} */ now, /** @type {any} */ respawnMs, /** @type {any} */ players) {
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
    let /** @type {any} */ combatLog = null;
    const /** @type {any} */ impacts = [];
    const target = Array.isArray(mobs) ? mobs.find((/** @type {any} */ m) => m.id === cast.targetId) : null;
    let newFired = firedTicks;
    while (newFired < (ability.channelTicks ?? 3) && now >= startedAt + (newFired + 1) * tickInterval) {
      const tickResult = fireChannelTick(player, ability, target, mobs, now, respawnMs, players);
      xpGain += tickResult.xpGain ?? 0;
      if (tickResult.leveledUp) leveledUp = true;
      if (tickResult.combatLog) combatLog = tickResult.combatLog;
      for (const impact of tickResult.impacts ?? []) {
        impacts.push(impact);
      }
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
      if (event) {
        event.hit = impacts.length > 0;
        if (impacts.length > 0) {
          event.impacts = impacts;
        }
      }
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
  let /** @type {any} */ combatLog = null;
  const /** @type {any} */ impacts = [];
  const target = Array.isArray(mobs) ? mobs.find((/** @type {any} */ mob) => mob.id === cast.targetId) : null;
  if (target && !target.dead && target.hp > 0) {
    if (withinRange(player.pos, target.pos, ability.range ?? 0)) {
      const { damage: rawDmg, derived, isCrit } = computeAbilityDamage(player, ability, now);
      const damage = applyPvpDamageMultiplier(rawDmg, ability, false);
      if (rollHit(derived.accuracy, 0)) {
        const result = applyDamageToMob({ mob: target, damage, attacker: player, now, respawnMs, players });
        const impact = makeDamageImpactForTarget(target, damage, isCrit, target.id, 'mob');
        if (impact) impacts.push(impact);
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
  if (event) {
    event.hit = impacts.length > 0;
    if (impacts.length > 0) {
      event.impacts = impacts;
    }
  }
  return { xpGain, leveledUp, combatLog, event };
}

export function stepDotTicks(/** @type {any} */ mobs, /** @type {any} */ now, /** @type {any} */ respawnMs, /** @type {any} */ players) {
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

export function stepHotTicks(/** @type {any} */ players, /** @type {any} */ now) {
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
