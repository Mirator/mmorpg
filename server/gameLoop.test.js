import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem, countInventory } from './logic/inventory.js';
import { createBasePlayerState } from './logic/players.js';
import { createGameLoop } from './gameLoop.js';
import { buildGameLoopRuntime, killPlayer, stepPlayerMovementPhase } from './gameLoopPhases.js';

function createTestWorld() {
  return {
    mapSize: 100,
    base: { x: 0, y: 0, z: 0, radius: 6 },
    obstacles: [],
    playerSpeed: 6,
    playerWalkSpeed: 3,
    playerInvSlots: 5,
    playerInvStackMax: 20,
  };
}

function createTestConfig() {
  return {
    tickHz: 10,
    playerRadius: 0.5,
    respawnMs: 5_000,
    corpse: { expiryMs: 600_000 },
    resource: {
      harvestRadius: 2,
      harvestDurationMs: 2_500,
      respawnMs: 15_000,
    },
    mob: {
      radius: 1,
      respawnMs: 10_000,
      attackDamageBase: 4,
      attackDamagePerLevel: 1,
    },
  };
}

function createTestPlayer(id, world, spawn = { x: 0, y: 0, z: 0 }) {
  const player = createBasePlayerState({
    world,
    spawn,
    classId: 'fighter',
  });
  player.id = id;
  player.keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    walk: false,
  };
  return player;
}

function createLoopDeps() {
  const world = createTestWorld();
  const config = createTestConfig();
  const player = createTestPlayer('p1', world);
  return {
    players: new Map([[player.id, player]]),
    world,
    resources: [],
    mobs: [],
    corpses: [],
    config,
    spawner: {
      getSpawnPoint: () => ({ x: 8, y: 0, z: 8 }),
    },
    nextItemIdRef: { current: 1 },
    markDirty: vi.fn(),
    onPlayerDamaged: vi.fn(),
    onCombatLog: vi.fn(),
    onPlayerDeath: vi.fn(),
    onCombatEvent: vi.fn(),
    onDuelEnded: vi.fn(),
  };
}

describe('gameLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules exactly one timer, ignores duplicate starts, and stop prevents pending work', async () => {
    const deps = createLoopDeps();
    const player = deps.players.get('p1');
    player.dead = true;
    player.hp = 0;
    player.respawnAt = Date.now();

    const loop = createGameLoop(deps);

    expect(vi.getTimerCount()).toBe(0);
    loop.start();
    expect(vi.getTimerCount()).toBe(1);

    loop.start();
    expect(vi.getTimerCount()).toBe(1);

    loop.stop();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(100);
    expect(player.dead).toBe(true);
    expect(player.respawnAt).toBe(Date.now() - 100);
  });
});

describe('gameLoopPhases', () => {
  it('moves living players and preserves stationary facing when no movement happens', () => {
    const world = createTestWorld();
    const runtime = buildGameLoopRuntime(createTestConfig(), undefined);
    const markDirty = vi.fn();
    const movingPlayer = createTestPlayer('moving', world);
    movingPlayer.keys.w = true;
    const stationaryPlayer = createTestPlayer('still', world, { x: 4, y: 0, z: 4 });
    stationaryPlayer.lastMoveDir = { x: 1, z: 0 };

    const players = new Map([
      [movingPlayer.id, movingPlayer],
      [stationaryPlayer.id, stationaryPlayer],
    ]);

    stepPlayerMovementPhase({
      players,
      world,
      spawner: {
        getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }),
      },
      now: 1_000,
      runtime,
      markDirty,
    });

    expect(movingPlayer.movedThisTick).toBe(true);
    expect(movingPlayer.lastMoveDir).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        z: expect.any(Number),
      })
    );
    expect(movingPlayer.pos.x).toBeLessThan(0);
    expect(movingPlayer.pos.z).toBeLessThan(0);

    expect(stationaryPlayer.movedThisTick).toBe(false);
    expect(stationaryPlayer.pos).toEqual({ x: 4, y: 0, z: 4 });
    expect(stationaryPlayer.lastMoveDir).toEqual({ x: 1, z: 0 });
    expect(markDirty).not.toHaveBeenCalled();
  });

  it('respawns dead players, clears harvest, and does not mark them as moved on the respawn tick', () => {
    const world = createTestWorld();
    const runtime = buildGameLoopRuntime(createTestConfig(), undefined);
    const markDirty = vi.fn();
    const respawnPoint = { x: 9, y: 0, z: -3 };
    const player = createTestPlayer('respawn', world, { x: 1, y: 0, z: 1 });
    player.dead = true;
    player.hp = 0;
    player.respawnAt = 1_000;
    player.harvest = {
      resourceId: 'r1',
      resourceType: 'ore',
      startedAt: 900,
      endsAt: 1_500,
      hpAtStart: 10,
    };

    stepPlayerMovementPhase({
      players: new Map([[player.id, player]]),
      world,
      spawner: {
        getSpawnPoint: () => respawnPoint,
      },
      now: 1_000,
      runtime,
      markDirty,
    });

    expect(player.dead).toBe(false);
    expect(player.hp).toBe(player.maxHp);
    expect(player.pos).toEqual(respawnPoint);
    expect(player.harvest).toBeNull();
    expect(player.movedThisTick).toBe(false);
    expect(markDirty).toHaveBeenCalledWith(player);
  });

  it('clears death state, creates a corpse when inventory is non-empty, and notifies callbacks', () => {
    const world = createTestWorld();
    const runtime = buildGameLoopRuntime(createTestConfig(), undefined);
    const markDirty = vi.fn();
    const onPlayerDeath = vi.fn();
    const onDuelEnded = vi.fn();
    const player = createTestPlayer('p1', world, { x: 2, y: 0, z: 3 });
    const opponent = createTestPlayer('p2', world, { x: 3, y: 0, z: 2 });
    const corpses = [];
    const now = 2_000;

    addItem(
      player.inventory,
      { id: 'loot-1', kind: 'ore', name: 'Ore', count: 2 },
      player.invStackMax
    );
    player.inv = countInventory(player.inventory);
    player.target = { x: 1, y: 0, z: 1 };
    player.targetId = 'm1';
    player.targetKind = 'mob';
    player.cast = { id: 'aimed_shot', endsAt: now + 500 };
    player.harvest = {
      resourceId: 'r1',
      resourceType: 'ore',
      startedAt: now - 100,
      endsAt: now + 100,
      hpAtStart: player.hp,
    };
    player.keys = { w: true, a: true, s: true, d: true, walk: true };
    player.duelOpponentId = opponent.id;
    opponent.duelOpponentId = player.id;

    const players = new Map([
      [player.id, player],
      [opponent.id, opponent],
    ]);

    killPlayer({
      player,
      players,
      corpses,
      now,
      runtime,
      markDirty,
      onPlayerDeath,
      onDuelEnded,
    });

    expect(player.dead).toBe(true);
    expect(player.respawnAt).toBe(now + runtime.respawnMs);
    expect(player.inv).toBe(0);
    expect(player.inventory.every((slot) => slot === null)).toBe(true);
    expect(player.target).toBeNull();
    expect(player.targetId).toBeNull();
    expect(player.targetKind).toBeNull();
    expect(player.cast).toBeNull();
    expect(player.harvest).toBeNull();
    expect(player.keys).toEqual({
      w: false,
      a: false,
      s: false,
      d: false,
      walk: true,
    });
    expect(corpses).toHaveLength(1);
    expect(countInventory(corpses[0].inventory)).toBe(2);
    expect(markDirty).toHaveBeenCalledWith(player);
    expect(onPlayerDeath).toHaveBeenCalledWith(player.id, now);
    expect(onDuelEnded).toHaveBeenCalledTimes(1);
    expect(onDuelEnded).toHaveBeenCalledWith(player, opponent, 'death', markDirty);
    expect(player.duelOpponentId).toBeUndefined();
    expect(opponent.duelOpponentId).toBeUndefined();
  });

  it('does not create a corpse or emit duel-ended when there is no lootable inventory or opponent', () => {
    const world = createTestWorld();
    const runtime = buildGameLoopRuntime(createTestConfig(), undefined);
    const markDirty = vi.fn();
    const onPlayerDeath = vi.fn();
    const onDuelEnded = vi.fn();
    const player = createTestPlayer('solo', world);
    player.duelOpponentId = 'missing-player';

    const corpses = [];

    killPlayer({
      player,
      players: new Map([[player.id, player]]),
      corpses,
      now: 500,
      runtime,
      markDirty,
      onPlayerDeath,
      onDuelEnded,
    });

    expect(corpses).toHaveLength(0);
    expect(onPlayerDeath).toHaveBeenCalledWith(player.id, 500);
    expect(onDuelEnded).not.toHaveBeenCalled();
  });
});
