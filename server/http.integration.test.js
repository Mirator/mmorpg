import http from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createWorldFromConfig } from './logic/world.js';
import { MAP_CONFIG_VERSION } from '../shared/mapConfig.js';

const store = vi.hoisted(() => ({
  accountsById: new Map(),
  accountsByLower: new Map(),
  sessionsById: new Map(),
  charactersById: new Map(),
  charactersByLower: new Map(),
}));

function resetStore() {
  store.accountsById.clear();
  store.accountsByLower.clear();
  store.sessionsById.clear();
  store.charactersById.clear();
  store.charactersByLower.clear();
}

vi.mock('./db/accountRepo.js', () => ({
  findAccountByUsernameLower: async (usernameLower) => store.accountsByLower.get(usernameLower) ?? null,
  createAccount: async (account) => {
    if (store.accountsByLower.has(account.usernameLower)) {
      const err = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    }
    const next = { ...account };
    store.accountsById.set(next.id, next);
    store.accountsByLower.set(next.usernameLower, next);
    return next;
  },
  updateAccountLastSeen: async (id, lastSeenAt = new Date()) => {
    const account = store.accountsById.get(id);
    if (!account) return null;
    account.lastSeenAt = lastSeenAt;
    return account;
  },
}));

vi.mock('./db/sessionRepo.js', () => ({
  createSession: async (session) => {
    const next = { ...session };
    store.sessionsById.set(next.id, next);
    return next;
  },
  getSessionWithAccount: async (id) => {
    const session = store.sessionsById.get(id);
    if (!session) return null;
    const account = store.accountsById.get(session.accountId) ?? null;
    return { ...session, account, accountId: session.accountId };
  },
  touchSession: async (id, lastSeenAt = new Date()) => {
    const session = store.sessionsById.get(id);
    if (!session) return null;
    session.lastSeenAt = lastSeenAt;
    return session;
  },
  deleteSession: async (id) => {
    const existed = store.sessionsById.delete(id);
    if (!existed) {
      const err = new Error('Not found');
      err.code = 'P2025';
      throw err;
    }
    return { id };
  },
}));

vi.mock('./db/playerRepo.js', () => ({
  createCharacter: async (character) => {
    if (store.charactersByLower.has(character.nameLower)) {
      const err = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    }
    const next = { ...character, updatedAt: new Date() };
    store.charactersById.set(next.id, next);
    store.charactersByLower.set(next.nameLower, next);
    return next;
  },
  deleteCharacter: async (accountId, id) => {
    const found = store.charactersById.get(id);
    if (!found || found.accountId !== accountId) {
      return { count: 0 };
    }
    store.charactersById.delete(id);
    store.charactersByLower.delete(found.nameLower);
    return { count: 1 };
  },
  findCharacterById: async (id) => store.charactersById.get(id) ?? null,
  findCharacterByNameLower: async (nameLower) => store.charactersByLower.get(nameLower) ?? null,
  listCharacters: async (accountId) =>
    [...store.charactersById.values()]
      .filter((character) => character.accountId === accountId)
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      .map((character) => ({
        id: character.id,
        name: character.name,
        classId: character.state?.classId ?? 'fighter',
        level: Number(character.state?.level ?? 1),
        updatedAt: character.updatedAt,
      })),
}));

vi.mock('./wsTicket.js', () => ({
  createTicket: ({ accountId, characterId }) => `ticket-${accountId}-${characterId}`,
}));

async function startServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function requestJson(baseUrl, route, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.cookie = cookie;

  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { res, payload };
}

describe('HTTP auth lifecycle integration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('supports signup/login/logout and character CRUD + ws ticket', async () => {
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig({
      version: MAP_CONFIG_VERSION,
      mapSize: 40,
      base: { x: 0, z: 0, radius: 4 },
      spawnPoints: [{ x: 0, z: 0 }],
      obstacles: [],
      structures: [],
      resourceNodes: [],
      vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: 0 }],
      mobSpawns: [],
    });

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: '/tmp/world-map.json',
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const signup = await requestJson(baseUrl, '/api/auth/signup', {
        method: 'POST',
        body: { username: 'alpha_user', password: 'password123' },
      });
      expect(signup.res.status).toBe(200);
      expect(signup.payload?.account?.username).toBe('alpha_user');
      const signupCookie = signup.res.headers.get('set-cookie')?.split(';')[0];
      expect(signupCookie).toContain(`${config.sessionCookieName}=`);

      const listBeforeCreate = await requestJson(baseUrl, '/api/characters', {
        cookie: signupCookie,
      });
      expect(listBeforeCreate.res.status).toBe(200);
      expect(listBeforeCreate.payload).toEqual({ characters: [] });

      const createCharacter = await requestJson(baseUrl, '/api/characters', {
        method: 'POST',
        cookie: signupCookie,
        body: { name: 'Alpha One', classId: 'fighter' },
      });
      expect(createCharacter.res.status).toBe(200);
      const characterId = createCharacter.payload?.character?.id;
      expect(typeof characterId).toBe('string');

      const listAfterCreate = await requestJson(baseUrl, '/api/characters', {
        cookie: signupCookie,
      });
      expect(listAfterCreate.res.status).toBe(200);
      expect(listAfterCreate.payload?.characters?.length).toBe(1);
      expect(listAfterCreate.payload?.characters?.[0]?.id).toBe(characterId);

      const ticket = await requestJson(baseUrl, '/api/ws-ticket', {
        method: 'POST',
        cookie: signupCookie,
        body: { characterId },
      });
      expect(ticket.res.status).toBe(200);
      expect(ticket.payload?.ticket).toContain(`-${characterId}`);

      const del = await requestJson(baseUrl, `/api/characters/${characterId}`, {
        method: 'DELETE',
        cookie: signupCookie,
      });
      expect(del.res.status).toBe(200);
      expect(del.payload).toEqual({ ok: true });

      const listAfterDelete = await requestJson(baseUrl, '/api/characters', {
        cookie: signupCookie,
      });
      expect(listAfterDelete.res.status).toBe(200);
      expect(listAfterDelete.payload).toEqual({ characters: [] });

      const logout = await requestJson(baseUrl, '/api/auth/logout', {
        method: 'POST',
        cookie: signupCookie,
      });
      expect(logout.res.status).toBe(200);
      expect(logout.payload).toEqual({ ok: true });

      const unauthorizedAfterLogout = await requestJson(baseUrl, '/api/characters', {
        cookie: signupCookie,
      });
      expect(unauthorizedAfterLogout.res.status).toBe(401);

      const login = await requestJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'alpha_user', password: 'password123' },
      });
      expect(login.res.status).toBe(200);
      const loginCookie = login.res.headers.get('set-cookie')?.split(';')[0];
      expect(loginCookie).toContain(`${config.sessionCookieName}=`);

      const listAfterLogin = await requestJson(baseUrl, '/api/characters', {
        cookie: loginCookie,
      });
      expect(listAfterLogin.res.status).toBe(200);
      expect(listAfterLogin.payload).toEqual({ characters: [] });
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
