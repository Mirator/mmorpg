import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDefaultEquipment } from '../../shared/equipment.js';
import { getResourceForClass } from '../../shared/classes.js';
import {
  tryUseAbility,
  tryBasicAttack,
  stepPlayerCast,
  stepPlayerResources,
} from './combat.js';
import { stepMobs } from './mobs.js';
import * as pvp from './pvp.js';

function makeWorld() {
  return {
    mapSize: 100,
    base: { x: 0, z: 0, radius: 5 },
    obstacles: [],
  };
}

function makePlayer(overrides = {}) {
  const classId = overrides.classId ?? 'fighter';
  const resourceDef = getResourceForClass(classId);
  const resourceMax = resourceDef?.max ?? 0;
  const resourceType = resourceDef?.type ?? null;
  const resource =
    resourceType === 'rage' ? 0 : resourceMax;
  return {
    id: overrides.id ?? 'p1',
    pos: overrides.pos ?? { x: 0, y: 0, z: 0 },
    dead: false,
    hp: overrides.hp ?? 100,
    maxHp: overrides.maxHp ?? 100,
    classId,
    level: overrides.level ?? 1,
    xp: 0,
    attackCooldownUntil: 0,
    targetId: null,
    targetKind: null,
    equipment: createDefaultEquipment(classId),
    resourceType,
    resourceMax,
    resource: overrides.resource ?? resource,
    abilityCooldowns: {},
    combatTagUntil: 0,
    lastMoveDir: overrides.lastMoveDir ?? null,
    movedThisTick: false,
    cast: null,
    moveSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    slowImmuneUntil: 0,
    defensiveStanceUntil: 0,
    keys: { w: false, a: false, s: false, d: false },
    ...overrides,
  };
}

function makeMob(id, x, z, level = 1) {
  const maxHp = 20 + 8 * level;
  return {
    id,
    pos: { x, y: 0, z },
    level,
    hp: maxHp,
    maxHp,
    dead: false,
    state: 'idle',
    targetId: null,
    nextDecisionAt: 0,
    dir: { x: 1, z: 0 },
    attackCooldownUntil: 0,
  };
}

describe('class abilities', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('blocks repeated shield slam stuns within immunity window', () => {
    const mob = makeMob('m1', 1.5, 0, 5);
    const guardianA = makePlayer({ id: 'g1', classId: 'guardian', level: 2 });
    const guardianB = makePlayer({ id: 'g2', classId: 'guardian', level: 2 });
    guardianA.targetId = mob.id;
    guardianA.targetKind = 'mob';
    guardianB.targetId = mob.id;
    guardianB.targetKind = 'mob';

    const first = tryUseAbility({
      player: guardianA,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(first.success).toBe(true);
    const firstStun = mob.stunnedUntil;
    expect(firstStun).toBeGreaterThan(0);

    const hpAfterFirst = mob.hp;
    const second = tryUseAbility({
      player: guardianB,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 1000,
      respawnMs: 10_000,
    });
    expect(second.success).toBe(true);
    expect(mob.stunnedUntil).toBe(firstStun);
    expect(mob.hp).toBeLessThan(hpAfterFirst);
  });

  it('ends defensive stance early when stamina hits zero', () => {
    const guardian = makePlayer({ classId: 'guardian', level: 3, resource: 50 });
    const result = tryUseAbility({
      player: guardian,
      slot: 3,
      mobs: [],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(guardian.defensiveStanceUntil).toBeGreaterThan(0);

    guardian.resource = 0;
    stepPlayerResources(guardian, 1000, 0);
    expect(guardian.defensiveStanceUntil).toBe(0);
    expect(guardian.moveSpeedMultiplier).toBe(1);
  });

  it('aimed shot cancels on movement and completes when stationary', () => {
    const ranger = makePlayer({ classId: 'ranger', level: 2 });
    const mob = makeMob('m1', 6, 0);
    ranger.targetId = mob.id;
    ranger.targetKind = 'mob';

    const start = tryUseAbility({
      player: ranger,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(start.success).toBe(true);
    expect(ranger.cast).toBeTruthy();

    ranger.movedThisTick = true;
    stepPlayerCast(ranger, [mob], 200, 10_000);
    expect(ranger.cast).toBe(null);
    expect(ranger.abilityCooldowns.aimed_shot).toBeUndefined();

    const restart = tryUseAbility({
      player: ranger,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 1000,
      respawnMs: 10_000,
    });
    expect(restart.success).toBe(true);
    ranger.movedThisTick = false;
    const beforeHp = mob.hp;
    const castResult = stepPlayerCast(ranger, [mob], 1700, 10_000);
    expect(castResult.xpGain).toBeGreaterThanOrEqual(0);
    expect(mob.hp).toBeLessThan(beforeHp);
    expect(ranger.abilityCooldowns.aimed_shot).toBeGreaterThan(0);
  });

  it('sets facing toward target when a targeted ability starts', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 2, resource: 100 });
    const mob = makeMob('m1', 1, 1);
    fighter.targetId = mob.id;
    fighter.targetKind = 'mob';

    const result = tryUseAbility({
      player: fighter,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(fighter.lastMoveDir?.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(fighter.lastMoveDir?.z).toBeCloseTo(Math.SQRT1_2, 5);
  });

  it('resolves a learned ability by explicit ability id for custom client loadouts', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 2, resource: 100 });
    const mob = makeMob('m1', 1.5, 0);
    fighter.targetId = mob.id;
    fighter.targetKind = 'mob';

    const result = tryUseAbility({
      player: fighter,
      slot: 8,
      abilityId: 'power_strike',
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });

    expect(result.success).toBe(true);
    expect(result.event?.abilityId).toBe('power_strike');
    expect(mob.hp).toBeLessThan(mob.maxHp);
  });

  it('adds crit impact metadata for targeted damage abilities', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 2, resource: 100 });
    const mob = makeMob('m1', 1.5, 0);
    fighter.targetId = mob.id;
    fighter.targetKind = 'mob';

    const result = tryUseAbility({
      player: fighter,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });

    expect(result.success).toBe(true);
    expect(result.event?.impacts?.[0]).toMatchObject({
      kind: 'damage',
      targetId: mob.id,
      targetKind: 'mob',
      isCrit: true,
    });
    expect(result.event?.impacts?.[0]?.amount).toBeGreaterThan(0);
  });

  it('sets facing toward placement when using placement abilities', () => {
    const ranger = makePlayer({ classId: 'ranger', level: 15, resource: 100 });
    const result = tryUseAbility({
      player: ranger,
      slot: 6,
      mobs: [],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
      placementX: 0,
      placementZ: 4,
    });
    expect(result.success).toBe(true);
    expect(ranger.lastMoveDir?.x).toBeCloseTo(0, 5);
    expect(ranger.lastMoveDir?.z).toBeCloseTo(1, 5);
  });

  it('sets facing at cast start for cast-time abilities', () => {
    const ranger = makePlayer({ classId: 'ranger', level: 2 });
    const mob = makeMob('m1', 4, 0);
    ranger.targetId = mob.id;
    ranger.targetKind = 'mob';

    const result = tryUseAbility({
      player: ranger,
      slot: 2,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(result.castStarted).toBe(true);
    expect(ranger.lastMoveDir?.x).toBeCloseTo(1, 5);
    expect(ranger.lastMoveDir?.z).toBeCloseTo(0, 5);
  });

  it('keeps facing unchanged for self abilities without cast direction', () => {
    const fighter = makePlayer({
      classId: 'fighter',
      level: 6,
      resource: 100,
      lastMoveDir: { x: 1, z: 0 },
    });
    const result = tryUseAbility({
      player: fighter,
      slot: 4,
      mobs: [],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(fighter.lastMoveDir).toEqual({ x: 1, z: 0 });
  });

  it('does not change facing when ability use fails', () => {
    const fighter = makePlayer({
      classId: 'fighter',
      level: 2,
      resource: 100,
      lastMoveDir: { x: 0, z: 1 },
    });
    const result = tryUseAbility({
      player: fighter,
      slot: 2,
      mobs: [],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_target');
    expect(fighter.lastMoveDir).toEqual({ x: 0, z: 1 });
  });

  it('sets facing toward target when basic attack succeeds', () => {
    const fighter = makePlayer({ classId: 'fighter' });
    const mob = makeMob('m1', 0, 1.5);
    fighter.targetId = mob.id;
    fighter.targetKind = 'mob';

    const result = tryBasicAttack({
      player: fighter,
      mobs: [mob],
      now: 0,
      respawnMs: 10_000,
      players: new Map(),
    });
    expect(result.success).toBe(true);
    expect(fighter.lastMoveDir?.x).toBeCloseTo(0, 5);
    expect(fighter.lastMoveDir?.z).toBeCloseTo(1, 5);
  });

  it('cleave damages mobs in the cone only', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 3, resource: 100 });
    const mobFront = makeMob('m1', 2, 0);
    const mobSide = makeMob('m2', 2, 1);
    const mobBehind = makeMob('m3', -2, 0);
    fighter.targetId = mobFront.id;
    fighter.targetKind = 'mob';

    const result = tryUseAbility({
      player: fighter,
      slot: 3,
      mobs: [mobFront, mobSide, mobBehind],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(mobFront.hp).toBeLessThan(mobFront.maxHp);
    expect(mobSide.hp).toBeLessThan(mobSide.maxHp);
    expect(mobBehind.hp).toBe(mobBehind.maxHp);
  });

  it('adds per-target impacts for aoe abilities', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 3, resource: 100 });
    const mobFront = makeMob('m1', 2, 0);
    const mobSide = makeMob('m2', 2, 1);
    const mobBehind = makeMob('m3', -2, 0);
    fighter.targetId = mobFront.id;
    fighter.targetKind = 'mob';

    const result = tryUseAbility({
      player: fighter,
      slot: 3,
      mobs: [mobFront, mobSide, mobBehind],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });

    expect(result.success).toBe(true);
    expect(result.event?.impacts ?? []).toHaveLength(2);
    expect(result.event?.impacts?.every((/** @type {any} */ impact) => impact.kind === 'damage')).toBe(true);
  });

  it('heal targets ally when selected and self when not', () => {
    const priest = makePlayer({ classId: 'priest', level: 2, resource: 120, hp: 80, maxHp: 100 });
    const ally = makePlayer({ id: 'p2', classId: 'fighter', level: 2, hp: 50, maxHp: 100 });
    const players = new Map([
      [priest.id, priest],
      [ally.id, ally],
    ]);
    priest.targetId = ally.id;
    priest.targetKind = 'player';

    const healAlly = tryUseAbility({
      player: priest,
      slot: 2,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(healAlly.success).toBe(true);
    expect(ally.hp).toBeGreaterThanOrEqual(80);

    priest.targetId = null;
    priest.targetKind = null;
    priest.hp = 40;
    const healSelf = tryUseAbility({
      player: priest,
      slot: 2,
      mobs: [],
      players,
      world: makeWorld(),
      now: 5000,
      respawnMs: 10_000,
    });
    expect(healSelf.success).toBe(true);
    expect(priest.hp).toBeGreaterThanOrEqual(70);
  });

  it('adds heal impact metadata for direct heals', () => {
    const priest = makePlayer({ classId: 'priest', level: 2, resource: 120 });
    const ally = makePlayer({ id: 'p2', classId: 'fighter', level: 2, hp: 40, maxHp: 100 });
    const players = new Map([[priest.id, priest], [ally.id, ally]]);
    priest.targetId = ally.id;
    priest.targetKind = 'player';

    const result = tryUseAbility({
      player: priest,
      slot: 2,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });

    expect(result.success).toBe(true);
    expect(result.event?.impacts?.[0]).toMatchObject({
      kind: 'heal',
      targetId: ally.id,
      targetKind: 'player',
    });
    expect(result.event?.impacts?.[0]?.amount).toBeGreaterThan(0);
  });

  it('smite applies weakened and reduces mob damage', () => {
    const priest = makePlayer({ classId: 'priest', level: 3, resource: 120 });
    const fighter = makePlayer({ id: 'p2', classId: 'fighter', level: 1, resource: 0 });
    fighter.pos = { x: 1, y: 0, z: 0 };
    const mob = makeMob('m1', 0, 0, 10);
    priest.targetId = mob.id;
    priest.targetKind = 'mob';

    const smite = tryUseAbility({
      player: priest,
      slot: 3,
      mobs: [mob],
      players: new Map([[priest.id, priest], [fighter.id, fighter]]),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(smite.success).toBe(true);
    expect(mob.weakenedUntil).toBeGreaterThan(0);
    expect(mob.dead).toBe(false);

    const world = { mapSize: 100, obstacles: [] };
    mob.state = 'chase';
    mob.targetId = fighter.id;
    stepMobs([mob], [fighter], world, 0.1, 1000, {
      attackDamageBase: 6,
      attackDamagePerLevel: 2,
      attackRange: 1.5,
      attackCooldownMs: 0,
      aggroRadius: 10,
      random: () => 0.5,
    });
    expect(fighter.hp).toBeLessThan(100);
    expect(fighter.resource).toBeGreaterThan(0);
  });

  it('frost nova slows nearby mobs', () => {
    const mage = makePlayer({ classId: 'mage', level: 3, resource: 100 });
    const mob = makeMob('m1', 1, 1, 1);
    mage.targetId = null;
    const result = tryUseAbility({
      player: mage,
      slot: 3,
      mobs: [mob],
      players: new Map(),
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(mob.slowUntil).toBe(3000);
    expect(mob.slowMultiplier).toBeCloseTo(0.5);
  });

  it('rage gains on hit and decays out of combat', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 1, resource: 0 });
    const mob = makeMob('m1', 1.5, 0, 1);
    fighter.targetId = mob.id;
    fighter.targetKind = 'mob';
    tryBasicAttack({ player: fighter, mobs: [mob], now: 0, respawnMs: 10_000 });
    expect(fighter.resource).toBe(8);

    fighter.resource = 50;
    fighter.combatTagUntil = 0;
    stepPlayerResources(fighter, 10_000, 1);
    expect(fighter.resource).toBe(45);
  });

  it('returns pvp_not_allowed when targeting player for damage without PvP', () => {
    const fighter = makePlayer({ classId: 'fighter', level: 2, resource: 100 });
    const target = makePlayer({ id: 'p2', classId: 'mage', level: 2, pos: { x: 1, y: 0, z: 0 } });
    const players = new Map([[fighter.id, fighter], [target.id, target]]);
    fighter.targetId = target.id;
    fighter.targetKind = 'player';

    const result = tryUseAbility({
      player: fighter,
      slot: 2,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('pvp_not_allowed');
    expect(target.hp).toBe(100);
  });

  it('PvP damage applies when isPvPAllowed returns true', () => {
    vi.spyOn(pvp, 'isPvPAllowed').mockReturnValue(true);
    const fighter = makePlayer({ classId: 'fighter', level: 2, resource: 100 });
    const target = makePlayer({ id: 'p2', classId: 'mage', level: 2, pos: { x: 1, y: 0, z: 0 } });
    const players = new Map([[fighter.id, fighter], [target.id, target]]);
    fighter.targetId = target.id;
    fighter.targetKind = 'player';

    const result = tryUseAbility({
      player: fighter,
      slot: 2,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(target.hp).toBeLessThan(100);
    vi.restoreAllMocks();
  });

  it('CC diminishing returns: 4th application within 10s yields immune', () => {
    vi.spyOn(pvp, 'isPvPAllowed').mockReturnValue(true);
    const mage = makePlayer({ classId: 'mage', level: 3, resource: 200 });
    const target = makePlayer({ id: 'p2', classId: 'fighter', level: 3, pos: { x: 1, y: 0, z: 0 } });
    const players = new Map([[mage.id, mage], [target.id, target]]);

    for (let i = 0; i < 4; i++) {
      tryUseAbility({
        player: mage,
        slot: 3,
        mobs: [],
        players,
        world: makeWorld(),
        now: i * 500,
        respawnMs: 10_000,
      });
    }
    expect(target.slowUntil).toBeGreaterThan(0);
    const afterThird = target.slowUntil;
    tryUseAbility({
      player: mage,
      slot: 3,
      mobs: [],
      players,
      world: makeWorld(),
      now: 2000,
      respawnMs: 10_000,
    });
    expect(target.slowUntil).toBe(afterThird);
    vi.restoreAllMocks();
  });

  it('Salvation fails when target died in PvP', () => {
    const priest = makePlayer({ classId: 'priest', level: 30, resource: 120 });
    const deadAlly = makePlayer({
      id: 'p2',
      classId: 'fighter',
      level: 2,
      dead: true,
      hp: 0,
      maxHp: 100,
      diedInPvPUntil: 999999,
    });
    const players = new Map([[priest.id, priest], [deadAlly.id, deadAlly]]);
    priest.targetId = deadAlly.id;
    priest.targetKind = 'player';

    const result = tryUseAbility({
      player: priest,
      slot: 9,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe('salvation_pve_only');
    expect(deadAlly.dead).toBe(true);
  });

  it('Salvation succeeds when target died in PvE', () => {
    const priest = makePlayer({ classId: 'priest', level: 30, resource: 120 });
    const deadAlly = makePlayer({
      id: 'p2',
      classId: 'fighter',
      level: 2,
      dead: true,
      hp: 0,
      maxHp: 100,
    });
    const players = new Map([[priest.id, priest], [deadAlly.id, deadAlly]]);
    priest.targetId = deadAlly.id;
    priest.targetKind = 'player';

    const result = tryUseAbility({
      player: priest,
      slot: 9,
      mobs: [],
      players,
      world: makeWorld(),
      now: 0,
      respawnMs: 10_000,
    });
    expect(result.success).toBe(true);
    expect(deadAlly.dead).toBe(false);
    expect(deadAlly.hp).toBe(50);
  });
});
