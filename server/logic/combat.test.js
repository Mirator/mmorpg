import { describe, it, expect } from 'vitest';
import { tryBasicAttack } from './combat.js';

function makePlayer(weaponKind) {
  return {
    id: 'p1',
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
    classId: 'fighter',
    level: 1,
    xp: 0,
    attackCooldownUntil: 0,
    targetId: null,
    equipment: {
      weapon: {
        id: 'w1',
        kind: weaponKind,
        name: 'Weapon',
        count: 1,
      },
      offhand: null,
      head: null,
      chest: null,
      legs: null,
      feet: null,
    },
  };
}

function makeMob(x) {
  return {
    id: 'm1',
    pos: { x, y: 0, z: 0 },
    level: 1,
    hp: 20,
    maxHp: 20,
    dead: false,
  };
}

describe('combat', () => {
  it('requires a valid target before attacking', () => {
    const mob = makeMob(2);
    const player = makePlayer('weapon_training_sword');
    const result = tryBasicAttack({
      player,
      mobs: [mob],
      now: 0,
      respawnMs: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_target');
    expect(player.attackCooldownUntil).toBe(0);
  });

  it('does not attack when target is out of range', () => {
    const mob = makeMob(3);
    const player = makePlayer('weapon_training_sword');
    player.targetId = mob.id;
    const result = tryBasicAttack({
      player,
      mobs: [mob],
      now: 0,
      respawnMs: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('out_of_range');
    expect(player.attackCooldownUntil).toBe(0);
  });

  it('uses weapon range for basic attack', () => {
    const mob = makeMob(1.5);
    const meleePlayer = makePlayer('weapon_training_sword');
    meleePlayer.targetId = mob.id;
    const meleeResult = tryBasicAttack({
      player: meleePlayer,
      mobs: [mob],
      now: 0,
      respawnMs: 1000,
    });
    expect(meleeResult.success).toBe(true);
    expect(meleeResult.event?.attackType).toBe('melee');

    const rangedPlayer = makePlayer('weapon_training_bow');
    rangedPlayer.targetId = 'm1';
    const rangedResult = tryBasicAttack({
      player: rangedPlayer,
      mobs: [makeMob(3)],
      now: 0,
      respawnMs: 1000,
    });
    expect(rangedResult.success).toBe(true);
    expect(rangedResult.event?.attackType).toBe('ranged');
  });

  it('grants xp on kill without forcing a level up', () => {
    const player = makePlayer('weapon_training_sword');
    const mob = makeMob(1.2);
    mob.hp = 5;
    player.targetId = mob.id;
    const result = tryBasicAttack({
      player,
      mobs: [mob],
      now: 0,
      respawnMs: 1000,
    });
    expect(result.success).toBe(true);
    expect(result.xpGain).toBeGreaterThan(0);
    expect(result.leveledUp).toBe(false);
    expect(player.level).toBe(1);
    expect(player.xp).toBe(result.xpGain);
  });
});
