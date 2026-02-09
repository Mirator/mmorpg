import { describe, it, expect } from 'vitest';
import { createWorld } from './logic/world.js';
import { xpToNext } from '../shared/progression.js';
import {
  buildAdminState,
  createAdminStateHandler,
  serializeMobs,
  serializePlayers,
  serializePlayersPublic,
  serializePlayerPrivate,
  serializeResources,
} from './admin.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRequest({ headerPass, queryPass } = {}) {
  return {
    get(name) {
      if (name.toLowerCase() !== 'x-admin-pass') return undefined;
      return headerPass;
    },
    query: queryPass ? { password: queryPass } : {},
  };
}

describe('admin state serialization', () => {
  it('serializes players, resources, and mobs', () => {
    const players = new Map([
      [
        'p1',
        {
          pos: { x: 1, y: 0, z: -2 },
          hp: 90,
          maxHp: 100,
          inv: 2,
          invCap: 5,
          invSlots: 2,
          invStackMax: 10,
          inventory: [
            { id: 'i1', kind: 'crystal', name: 'Crystal', count: 2 },
            null,
          ],
          currencyCopper: 120,
          classId: 'fighter',
          level: 2,
          xp: 15,
          dead: false,
          respawnAt: 0,
        },
      ],
    ]);
    const resources = [
      { id: 'r1', x: 5, z: 6, available: true, respawnAt: 0 },
    ];
    const mobs = [
      {
        id: 'm1',
        pos: { x: -3, y: 0, z: 4 },
        state: 'idle',
        targetId: null,
      },
    ];

    expect(serializePlayers(players)).toEqual({
      p1: {
        x: 1,
        y: 0,
        z: -2,
        hp: 90,
        maxHp: 100,
        classId: 'fighter',
        level: 2,
        xp: 15,
        xpToNext: xpToNext(2),
        inv: 2,
        invCap: 5,
        invSlots: 2,
        invStackMax: 10,
        inventory: [{ id: 'i1', kind: 'crystal', name: 'Crystal', count: 2 }, null],
        currencyCopper: 120,
        dead: false,
        respawnAt: 0,
      },
    });
    expect(serializeResources(resources)).toEqual([
      { id: 'r1', x: 5, z: 6, available: true, respawnAt: 0 },
    ]);
    expect(serializeMobs(mobs)).toEqual([
      {
        id: 'm1',
        x: -3,
        z: 4,
        state: 'idle',
        targetId: null,
        level: 1,
        hp: 0,
        maxHp: 0,
        dead: false,
        respawnAt: 0,
      },
    ]);
  });

  it('serializes public player state without private fields', () => {
    const players = new Map([
      [
        'p1',
        {
          pos: { x: 2, y: 0, z: 3 },
          hp: 50,
          maxHp: 100,
          inv: 4,
          invCap: 10,
          invSlots: 2,
          invStackMax: 5,
          inventory: [{ id: 'i1', kind: 'crystal', name: 'Crystal', count: 2 }],
          currencyCopper: 55,
          classId: 'mage',
          level: 3,
          xp: 44,
          dead: true,
          respawnAt: 12345,
        },
      ],
    ]);

    expect(serializePlayersPublic(players)).toEqual({
      p1: {
        x: 2,
        y: 0,
        z: 3,
        hp: 50,
        maxHp: 100,
        inv: 4,
        currencyCopper: 55,
        dead: true,
        classId: 'mage',
        level: 3,
      },
    });
  });

  it('serializes private player fields for local client', () => {
    const player = {
      invCap: 10,
      invSlots: 2,
      invStackMax: 5,
      inventory: [{ id: 'i1', kind: 'crystal', name: 'Crystal', count: 2 }],
      respawnAt: 12345,
      hp: 50,
      currencyCopper: 55,
      classId: 'ranger',
      level: 4,
      xp: 22,
      attackCooldownUntil: 9876,
    };

    expect(serializePlayerPrivate(player)).toEqual({
      invCap: 10,
      invSlots: 2,
      invStackMax: 5,
      inventory: [{ id: 'i1', kind: 'crystal', name: 'Crystal', count: 2 }],
      currencyCopper: 55,
      respawnAt: 12345,
      classId: 'ranger',
      level: 4,
      xp: 22,
      xpToNext: xpToNext(4),
      attackCooldownUntil: 9876,
    });
  });

  it('builds admin state with world snapshot', () => {
    const world = createWorld();
    const players = new Map();
    const resources = [];
    const mobs = [];
    const now = 123456;
    const state = buildAdminState({ world, players, resources, mobs, now });
    expect(state.t).toBe(now);
    expect(state.world.mapSize).toBe(world.mapSize);
    expect(state.world.base).toEqual(world.base);
    expect(Array.isArray(state.world.vendors)).toBe(true);
    expect(state.players).toEqual({});
  });
});

describe('admin endpoint handler', () => {
  const world = createWorld();
  const players = new Map();
  const resources = [];
  const mobs = [];
  const handler = createAdminStateHandler({
    password: 'secret',
    world,
    players,
    resources,
    mobs,
  });

  it('rejects missing password', () => {
    const req = createRequest();
    const res = createResponse();
    handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects wrong password', () => {
    const req = createRequest({ headerPass: 'nope' });
    const res = createResponse();
    handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('accepts header password', () => {
    const req = createRequest({ headerPass: 'secret' });
    const res = createResponse();
    handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.world.mapSize).toBe(world.mapSize);
  });

  it('accepts query password fallback', () => {
    const req = createRequest({ queryPass: 'secret' });
    const res = createResponse();
    handler(req, res);
    expect(res.statusCode).toBe(200);
  });
});
