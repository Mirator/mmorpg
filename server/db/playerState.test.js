import { describe, it, expect } from 'vitest';
import { migratePlayerState, PLAYER_STATE_VERSION } from './playerState.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';

describe('player state migration', () => {
  it('upgrades legacy state to current version', () => {
    const legacy = { pos: { x: 1, z: 2 }, hp: 5 };
    const result = migratePlayerState(legacy, undefined);
    expect(result.version).toBe(PLAYER_STATE_VERSION);
    expect(result.didUpgrade).toBe(true);
    expect(result.state.classId).toBe(DEFAULT_CLASS_ID);
    expect(result.state.level).toBe(1);
    expect(result.state.xp).toBe(0);
    expect(result.state.currencyCopper).toBe(0);
  });

  it('preserves newer state versions', () => {
    const future = { pos: { x: 0, z: 0 }, hp: 10 };
    const result = migratePlayerState(future, PLAYER_STATE_VERSION + 1);
    expect(result.version).toBe(PLAYER_STATE_VERSION + 1);
    expect(result.didUpgrade).toBe(false);
  });
});
