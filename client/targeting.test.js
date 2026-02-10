import { describe, it, expect } from 'vitest';
import { deriveTargetName, resolveTarget } from './targeting.js';

describe('targeting helpers', () => {
  it('derives mob names from ids', () => {
    expect(deriveTargetName({ kind: 'mob', id: 'm1' })).toBe('Mob 1');
    expect(deriveTargetName({ kind: 'mob', id: 'm-test' })).toBe('Test Mob');
  });

  it('resolves mob, player, and vendor targets', () => {
    const mobs = [
      { id: 'm1', x: 1, z: 2, level: 3, hp: 12, maxHp: 20, dead: false },
    ];
    const players = {
      p1: { x: 5, z: 6, level: 2, hp: 30, maxHp: 50, name: 'Ava' },
    };
    const vendors = [{ id: 'v1', x: 0, z: 0, name: 'General Vendor' }];

    const mobTarget = resolveTarget({ kind: 'mob', id: 'm1' }, { mobs, players, vendors });
    expect(mobTarget?.name).toBe('Mob 1');
    expect(mobTarget?.level).toBe(3);
    expect(mobTarget?.hp).toBe(12);

    const playerTarget = resolveTarget(
      { kind: 'player', id: 'p1' },
      { mobs, players, vendors }
    );
    expect(playerTarget?.name).toBe('Ava');
    expect(playerTarget?.level).toBe(2);
    expect(playerTarget?.hp).toBe(30);

    const vendorTarget = resolveTarget(
      { kind: 'vendor', id: 'v1' },
      { mobs, players, vendors }
    );
    expect(vendorTarget?.name).toBe('General Vendor');
    expect(vendorTarget?.hp).toBeNull();
  });
});
