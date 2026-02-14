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
    const mob = makeMob('m1', 1.5, 0);
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
    expect(ally.hp).toBe(80);

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
    expect(priest.hp).toBe(70);
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
    expect(mob.slowMultiplier).toBeCloseTo(0.4);
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
});
