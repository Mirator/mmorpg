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
  it('uses weapon range for basic attack', () => {
    const mob = makeMob(3);
    const meleePlayer = makePlayer('weapon_training_sword');
    const meleeResult = tryBasicAttack({
      player: meleePlayer,
      mobs: [mob],
      now: 0,
      respawnMs: 1000,
    });
    expect(meleeResult.success).toBe(false);
    expect(meleeResult.event?.attackType).toBe('melee');

    const rangedPlayer = makePlayer('weapon_training_bow');
    const rangedResult = tryBasicAttack({
      player: rangedPlayer,
      mobs: [makeMob(3)],
      now: 0,
      respawnMs: 1000,
    });
    expect(rangedResult.success).toBe(true);
    expect(rangedResult.event?.attackType).toBe('ranged');
  });
});
