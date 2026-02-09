import { addXp, calculateMobXp } from '../../shared/progression.js';
import { getClassById } from '../../shared/classes.js';
import { COMBAT_CONFIG } from '../../shared/config.js';
import { getMobMaxHp } from './mobs.js';

export function getBasicAttackConfig(classId) {
  const klass = getClassById(classId);
  return {
    damage: COMBAT_CONFIG.basicAttackDamage,
    cooldownMs: COMBAT_CONFIG.basicAttackCooldownMs,
    range: klass?.attackRange ?? 2.0,
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
  const config = getBasicAttackConfig(player.classId);
  if (now < (player.attackCooldownUntil ?? 0)) {
    return { success: false, reason: 'cooldown' };
  }

  const target = findNearestMobInRange(mobs, player.pos, config.range);
  if (!target) return { success: false, reason: 'no_target' };

  if (!Number.isFinite(target.maxHp)) {
    target.maxHp = getMobMaxHp(target.level ?? 1);
  }
  if (!Number.isFinite(target.hp)) {
    target.hp = target.maxHp;
  }

  target.hp = Math.max(0, target.hp - config.damage);
  player.attackCooldownUntil = now + config.cooldownMs;

  let xpGain = 0;
  let leveledUp = false;
  if (target.hp <= 0) {
    target.dead = true;
    target.state = 'dead';
    target.targetId = null;
    target.respawnAt = now + (respawnMs ?? 10_000);
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

  return { success: true, targetId: target.id, xpGain, leveledUp };
}
