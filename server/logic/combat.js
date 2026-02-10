import { addXp, calculateMobXp } from '../../shared/progression.js';
import { getClassById } from '../../shared/classes.js';
import { COMBAT_CONFIG } from '../../shared/config.js';
import { getEquippedWeapon } from '../../shared/equipment.js';
import { getMobMaxHp } from './mobs.js';

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

  if (!player.targetId) {
    return { success: false, reason: 'no_target' };
  }

  const target = Array.isArray(mobs) ? mobs.find((mob) => mob.id === player.targetId) : null;
  if (!target || target.dead || target.hp <= 0) {
    player.targetId = null;
    return { success: false, reason: 'no_target' };
  }

  const dist2 = distance2(target.pos ?? target, player.pos);
  if (dist2 > config.range * config.range) {
    return { success: false, reason: 'out_of_range' };
  }

  player.attackCooldownUntil = now + config.cooldownMs;

  if (!Number.isFinite(target.maxHp)) {
    target.maxHp = getMobMaxHp(target.level ?? 1);
  }
  if (!Number.isFinite(target.hp)) {
    target.hp = target.maxHp;
  }

  target.hp = Math.max(0, target.hp - config.damage);

  let xpGain = 0;
  let leveledUp = false;
  if (target.hp <= 0) {
    target.dead = true;
    target.state = 'dead';
    target.targetId = null;
    target.respawnAt = now + (respawnMs ?? 10_000);
    player.targetId = null;
    xpGain = calculateMobXp(target.level ?? 1, player.level ?? 1);
    if (xpGain > 0) {
      const beforeLevel = player.level ?? 1;
      const result = addXp(
        { level: player.level ?? 1, xp: player.xp ?? 0 },
        xpGain
      );
      player.level = result.level;
      player.xp = result.xp;
      leveledUp = player.level > beforeLevel;
    }
  }

  const from = { x: player.pos.x, z: player.pos.z };
  const to = { x: target.pos.x, z: target.pos.z };
  const durationMs = config.attackType === 'ranged' ? 200 : 180;

  return {
    success: true,
    targetId: target.id,
    xpGain,
    leveledUp,
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
