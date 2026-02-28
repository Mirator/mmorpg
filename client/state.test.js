import { describe, expect, it } from 'vitest';
import { createGameState } from './state.js';

function createState() {
  return createGameState({
    interpDelayMs: 100,
    maxSnapshots: 10,
    maxSnapshotAgeMs: 5000,
  });
}

describe('game state interpolation', () => {
  it('interpolates player positions and reuses per-player objects', () => {
    const state = createState();
    state.setLocalPlayerId('p1');
    state.pushSnapshot(
      {
        p1: { x: 0, y: 0, z: 0 },
        p2: { x: 10, y: 2, z: 5 },
      },
      1000
    );
    state.pushSnapshot(
      {
        p1: { x: 10, y: 4, z: 20 },
      },
      1200
    );

    const frameA = state.renderInterpolatedPlayers(1250);
    expect(frameA.positions.p1.x).toBeCloseTo(7.5);
    expect(frameA.positions.p1.y).toBeCloseTo(3);
    expect(frameA.positions.p1.z).toBeCloseTo(15);
    expect(frameA.positions.p2).toBeUndefined();
    expect(frameA.localPos).toEqual({ x: 7.5, y: 3, z: 15 });

    const p1Ref = frameA.positions.p1;
    const localRef = frameA.localPos;
    const frameB = state.renderInterpolatedPlayers(1250);
    expect(frameB.positions).toBe(frameA.positions);
    expect(frameB.positions.p1).toBe(p1Ref);
    expect(frameB.localPos).toBe(localRef);
  });

  it('interpolates mobs and reuses mob objects', () => {
    const state = createState();
    state.pushMobSnapshot(
      [
        { id: 'm1', x: 0, y: 0, z: 0, state: 'idle', hp: 10, maxHp: 10, dead: false },
      ],
      1000
    );
    state.pushMobSnapshot(
      [
        { id: 'm1', x: 20, y: 4, z: 10, state: 'chase', hp: 8, maxHp: 10, dead: false },
      ],
      1200
    );

    const frameA = state.renderInterpolatedMobs(1250);
    expect(frameA).toHaveLength(1);
    expect(frameA[0].x).toBeCloseTo(15);
    expect(frameA[0].y).toBeCloseTo(3);
    expect(frameA[0].z).toBeCloseTo(7.5);
    expect(frameA[0].state).toBe('chase');
    expect(frameA[0].hp).toBe(8);

    const mobRef = frameA[0];
    const frameB = state.renderInterpolatedMobs(1250);
    expect(frameB).toBe(frameA);
    expect(frameB[0]).toBe(mobRef);
  });
});
