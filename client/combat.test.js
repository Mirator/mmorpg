import { describe, it, expect, vi } from 'vitest';
import { createCombat } from './combat.js';

function createCombatHarness() {
  const renderSystem = {
    triggerAttack: vi.fn(),
    spawnProjectile: vi.fn(),
    spawnSlash: vi.fn(),
    spawnNova: vi.fn(),
    spawnCone: vi.fn(),
    spawnBuffAura: vi.fn(),
    spawnDashTrail: vi.fn(),
    spawnHealRing: vi.fn(),
    spawnCombatText: vi.fn(),
    spawnHitConfirm: vi.fn(),
    setPlacementIndicator: vi.fn(),
    updatePlacementIndicator: vi.fn(),
  };

  const gameState = {
    getConfigSnapshot: () => ({ combat: { targetSelectRange: 25 } }),
    getLatestMobs: () => [],
    getLatestPlayers: () => ({}),
    getLocalPlayer: () => null,
    getServerNow: () => 1000,
  };

  const ui = {
    isUiBlocking: () => false,
    getCurrentClassId: () => 'fighter',
    getLocalCooldown: () => 0,
    setLocalCooldown: () => {},
    updateAbilityBar: () => {},
  };

  const ctx = {
    playerId: 'p-local',
    selectedTarget: null,
    currentMe: null,
  };

  const combat = createCombat({
    gameState,
    ui,
    renderSystem,
    sendWithSeq: () => {},
    ctx,
  });

  return { combat, renderSystem };
}

describe('client combat impact readability', () => {
  it('spawns floating feedback for outgoing local impacts', () => {
    const { combat, renderSystem } = createCombatHarness();
    combat.handleCombatEvent(
      {
        kind: 'ability',
        abilityId: 'firebolt',
        effectType: 'projectile',
        attackerId: 'p-local',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 0, z: 0 },
        hit: true,
        durationMs: 300,
        impacts: [
          {
            kind: 'damage',
            amount: 42,
            targetId: 'm1',
            targetKind: 'mob',
            x: 2,
            y: 0,
            z: 0,
          },
        ],
      },
      1200,
      1200
    );

    expect(renderSystem.spawnCombatText).toHaveBeenCalledTimes(1);
    expect(renderSystem.spawnHitConfirm).toHaveBeenCalledTimes(1);
    expect(renderSystem.spawnProjectile).toHaveBeenCalledWith(
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      300,
      1200,
      { spawnImpactOnEnd: true }
    );
  });

  it('spawns floating feedback for incoming local impacts', () => {
    const { combat, renderSystem } = createCombatHarness();
    combat.handleCombatEvent(
      {
        kind: 'basic_attack',
        attackType: 'melee',
        attackerId: 'm1',
        from: { x: 1, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 },
        hit: true,
        durationMs: 180,
        impacts: [
          {
            kind: 'damage',
            amount: 15,
            targetId: 'p-local',
            targetKind: 'player',
            x: 0,
            y: 0,
            z: 0,
          },
        ],
      },
      1200,
      1200
    );

    expect(renderSystem.spawnCombatText).toHaveBeenCalledTimes(1);
    expect(renderSystem.spawnHitConfirm).toHaveBeenCalledTimes(1);
  });

  it('skips floating feedback for unrelated nearby impacts', () => {
    const { combat, renderSystem } = createCombatHarness();
    combat.handleCombatEvent(
      {
        kind: 'ability',
        abilityId: 'firebolt',
        effectType: 'projectile',
        attackerId: 'p-other',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 0, z: 0 },
        hit: true,
        durationMs: 300,
        impacts: [
          {
            kind: 'damage',
            amount: 22,
            targetId: 'p-third',
            targetKind: 'player',
            x: 2,
            y: 0,
            z: 0,
          },
        ],
      },
      1200,
      1200
    );

    expect(renderSystem.spawnCombatText).not.toHaveBeenCalled();
    expect(renderSystem.spawnHitConfirm).not.toHaveBeenCalled();
  });

  it('passes crit metadata into combat text payload', () => {
    const { combat, renderSystem } = createCombatHarness();
    combat.handleCombatEvent(
      {
        kind: 'ability',
        abilityId: 'firebolt',
        effectType: 'projectile',
        attackerId: 'p-local',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 2, y: 0, z: 0 },
        hit: true,
        durationMs: 300,
        impacts: [
          {
            kind: 'damage',
            amount: 99,
            isCrit: true,
            targetId: 'm1',
            targetKind: 'mob',
            x: 2,
            y: 0,
            z: 0,
          },
        ],
      },
      1200,
      1200
    );

    expect(renderSystem.spawnCombatText).toHaveBeenCalledTimes(1);
    expect(renderSystem.spawnCombatText.mock.calls[0][1]).toMatchObject({
      kind: 'damage_dealt',
      amount: 99,
      isCrit: true,
    });
  });
});
