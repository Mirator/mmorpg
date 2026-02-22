import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

async function requestJson(baseUrl, route, { method = 'GET', body, cookie, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders ?? {}) };
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

async function requestText(baseUrl, route) {
  const res = await fetch(`${baseUrl}${route}`);
  const text = await res.text();
  return { res, text };
}

function buildMapConfig(overrides = {}) {
  return {
    version: MAP_CONFIG_VERSION,
    mapSize: 40,
    base: { x: 0, z: 0, radius: 4 },
    spawnPoints: [{ x: 0, z: 0 }],
    obstacles: [],
    structures: [],
    resourceNodes: [],
    vendors: [],
    mobSpawns: [],
    ...overrides,
  };
}

function createTempAdminFiles() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-admin-'));
  const mapPath = path.join(tmpDir, 'world-map.json');
  const designerStatePath = path.join(tmpDir, 'world-map.designer.json');
  fs.writeFileSync(mapPath, JSON.stringify(buildMapConfig(), null, 2), 'utf8');
  return {
    mapPath,
    designerStatePath,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('HTTP auth lifecycle integration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('supports signup/login/logout and character CRUD + ws ticket', async () => {
    const files = createTempAdminFiles();
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig({
      ...buildMapConfig(),
      vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: 0 }],
    });

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
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
      files.cleanup();
    }
  });
});

describe('admin page routes', () => {
  it('serves redesigned admin pages and module screens', async () => {
    const files = createTempAdminFiles();
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig(buildMapConfig());

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const dashboard = await requestText(baseUrl, '/admin');
      expect(dashboard.res.status).toBe(200);
      expect(dashboard.text).toContain('Zone List');

      const map = await requestText(baseUrl, '/admin/map');
      expect(map.res.status).toBe(200);
      expect(map.text).toContain('Zone Canvas');

      const placeholders = [
        ['/admin/patches', 'Patch Manager'],
        ['/admin/assets', 'Asset Manager'],
        ['/admin/events', 'Event & Trigger'],
        ['/admin/nav', 'Navmesh'],
        ['/admin/collab', 'Collaboration'],
        ['/admin/playtest', 'Playtest'],
      ];

      for (const [route, marker] of placeholders) {
        const page = await requestText(baseUrl, route);
        expect(page.res.status).toBe(200);
        expect(page.text).toContain(marker);
      }
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });
});

describe('admin designer APIs', () => {
  it('guards new routes with admin password', async () => {
    const files = createTempAdminFiles();
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig(buildMapConfig());

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const routes = [
        '/admin/designer-state?zone=world-map',
        '/admin/prefabs?zone=world-map',
        '/admin/comments?zone=world-map',
        '/admin/locks?zone=world-map',
        '/admin/audit?zone=world-map',
      ];

      for (const route of routes) {
        const unauthorized = await requestJson(baseUrl, route, {
          headers: { 'x-admin-pass': 'bad' },
        });
        expect(unauthorized.res.status).toBe(401);
      }

      const ok = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        headers: { 'x-admin-pass': '1234' },
      });
      expect(ok.res.status).toBe(200);
      expect(ok.payload?.zoneKey).toBe('world-map');
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('returns revision and lock conflicts', async () => {
    const files = createTempAdminFiles();
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig(buildMapConfig());

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const headers = { 'x-admin-pass': '1234', 'x-admin-alias': 'alice' };
      const initial = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { headers });
      expect(initial.res.status).toBe(200);

      const firstSave = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        method: 'PUT',
        headers,
        body: {
          expectedRevision: initial.payload.revision,
          zoneState: {
            ...initial.payload.zoneState,
            navAreas: [
              {
                id: 'nav-1',
                name: 'Lane',
                shape: 'circle',
                x: 3,
                y: 0,
                z: 4,
                radius: 5,
                width: 10,
                height: 10,
                walkCost: 1,
                runCost: 0.8,
                tags: ['lane'],
              },
            ],
          },
        },
      });
      expect(firstSave.res.status).toBe(200);

      const staleSave = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        method: 'PUT',
        headers,
        body: {
          expectedRevision: initial.payload.revision,
          zoneState: initial.payload.zoneState,
        },
      });
      expect(staleSave.res.status).toBe(409);
      expect(staleSave.payload?.error).toBe('Revision conflict');

      const acquireLock = await requestJson(baseUrl, '/admin/locks/layer/props?zone=world-map', {
        method: 'POST',
        headers,
        body: { action: 'acquire', reason: 'editing prefabs' },
      });
      expect(acquireLock.res.status).toBe(200);

      const blockedCreate = await requestJson(baseUrl, '/admin/prefabs?zone=world-map', {
        method: 'POST',
        headers: { 'x-admin-pass': '1234', 'x-admin-alias': 'bob' },
        body: {
          name: 'Locked',
          entityType: 'structures',
          assetPath: '/assets/test.glb',
          tags: [],
          defaults: {},
        },
      });
      expect(blockedCreate.res.status).toBe(423);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('publishes and rolls back patch snapshots', async () => {
    const files = createTempAdminFiles();
    const config = getServerConfig({ HOST: '127.0.0.1', PORT: '3000' });
    const world = createWorldFromConfig(buildMapConfig());

    const app = createHttpApp({
      config,
      world,
      players: new Map(),
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const headers = { 'x-admin-pass': '1234', 'x-admin-alias': 'alice' };
      const state = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { headers });
      expect(state.res.status).toBe(200);

      const createPatch = await requestJson(baseUrl, '/admin/patches?zone=world-map', {
        method: 'POST',
        headers,
        body: {
          title: 'Integration publish',
          description: 'test',
          dependencyIds: [],
          sourceSnapshot: {
            mapConfig: buildMapConfig({ mapSize: 120 }),
            zoneState: {
              ...state.payload.zoneState,
              navAreas: [
                {
                  id: 'lane-main',
                  name: 'Main lane',
                  shape: 'circle',
                  x: 9,
                  y: 0,
                  z: 9,
                  radius: 6,
                  width: 10,
                  height: 10,
                  walkCost: 1,
                  runCost: 0.7,
                  tags: [],
                },
              ],
            },
          },
        },
      });
      expect(createPatch.res.status).toBe(201);
      const patchId = createPatch.payload?.patch?.id;
      expect(typeof patchId).toBe('string');

      const requestApproval = await requestJson(
        baseUrl,
        `/admin/patches/${patchId}/request-approval?zone=world-map`,
        { method: 'POST', headers }
      );
      expect(requestApproval.res.status).toBe(200);

      const approve = await requestJson(baseUrl, `/admin/patches/${patchId}/approve?zone=world-map`, {
        method: 'POST',
        headers,
      });
      expect(approve.res.status).toBe(200);

      const publish = await requestJson(baseUrl, `/admin/patches/${patchId}/publish?zone=world-map`, {
        method: 'POST',
        headers,
      });
      expect(publish.res.status).toBe(200);
      expect(publish.payload).toEqual({ ok: true, restartRequired: true });

      const publishedMap = readJson(files.mapPath);
      expect(publishedMap.mapSize).toBe(120);

      const afterPublish = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { headers });
      expect(afterPublish.payload?.zoneState?.navAreas?.some((entry) => entry.id === 'lane-main')).toBe(true);

      const rollback = await requestJson(baseUrl, `/admin/patches/${patchId}/rollback?zone=world-map`, {
        method: 'POST',
        headers,
      });
      expect(rollback.res.status).toBe(200);
      expect(rollback.payload).toEqual({ ok: true, restartRequired: true });

      const rolledBackMap = readJson(files.mapPath);
      expect(rolledBackMap.mapSize).toBe(40);

      const afterRollback = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { headers });
      expect(afterRollback.payload?.zoneState?.navAreas?.some((entry) => entry.id === 'lane-main')).toBe(false);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });
});
