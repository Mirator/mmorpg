import { describe, it, expect } from 'vitest';
import { stepMobs } from './mobs.js';

describe('mobs', () => {
  it('chases players within aggro radius', () => {
    const mob = {
      id: 'm1',
      pos: { x: 0, y: 0, z: 0 },
      state: 'idle',
      targetId: null,
      nextDecisionAt: 0,
      dir: { x: 1, z: 0 },
      attackCooldownUntil: 0,
    };
    const player = {
      id: 'p1',
      pos: { x: 5, y: 0, z: 0 },
      hp: 100,
      dead: false,
    };

    stepMobs(
      [mob],
      [player],
      { mapSize: 100, obstacles: [] },
      0.1,
      1000,
      { aggroRadius: 10, random: () => 0.5 }
    );

    expect(mob.state).toBe('chase');
    expect(mob.targetId).toBe('p1');
  });

  it('damages players on contact with cooldown', () => {
    const mob = {
      id: 'm1',
      pos: { x: 0, y: 0, z: 0 },
      state: 'chase',
      targetId: 'p1',
      nextDecisionAt: 0,
      dir: { x: 1, z: 0 },
      attackCooldownUntil: 0,
    };
    const player = {
      id: 'p1',
      pos: { x: 1, y: 0, z: 0 },
      hp: 100,
      dead: false,
    };

    stepMobs(
      [mob],
      [player],
      { mapSize: 100, obstacles: [] },
      0.1,
      1000,
      {
        aggroRadius: 10,
        attackRange: 1.5,
        attackDamage: 7,
        attackCooldownMs: 1000,
        random: () => 0.5,
      }
    );

    expect(player.hp).toBe(93);

    stepMobs(
      [mob],
      [player],
      { mapSize: 100, obstacles: [] },
      0.1,
      1500,
      {
        aggroRadius: 10,
        attackRange: 1.5,
        attackDamage: 7,
        attackCooldownMs: 1000,
        random: () => 0.5,
      }
    );

    expect(player.hp).toBe(93);
  });
});
