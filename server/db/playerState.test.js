import { describe, it, expect } from 'vitest';
import { migratePlayerState, PLAYER_STATE_VERSION } from './playerState.js';
import { DEFAULT_CLASS_ID } from '../../shared/classes.js';
import { getDefaultKnownRecipeIds } from '../../shared/recipes.js';
import { PROFESSION_TRACKS } from '../../shared/professions.js';

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
    expect(result.state.equipment ?? null).not.toBe(undefined);
  });

  it('preserves newer state versions', () => {
    const future = { pos: { x: 0, z: 0 }, hp: 10 };
    const result = migratePlayerState(future, PLAYER_STATE_VERSION + 1);
    expect(result.version).toBe(PLAYER_STATE_VERSION + 1);
    expect(result.didUpgrade).toBe(false);
  });

  it('adds v3 progression fields for v2 saves', () => {
    const v2State = {
      pos: { x: 0, z: 0 },
      hp: 10,
      classId: 'fighter',
      level: 3,
      xp: 25,
      equipment: null,
    };
    const result = migratePlayerState(v2State, 2);
    expect(result.version).toBe(PLAYER_STATE_VERSION);
    expect(result.state.activeContracts).toEqual([]);
    expect(result.state.knownRecipes).toEqual(getDefaultKnownRecipeIds());
    for (const track of PROFESSION_TRACKS) {
      expect(result.state.professionMasteries[track]).toEqual({ level: 1, xp: 0 });
    }
  });
});
