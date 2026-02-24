import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getServerConfig } from './config.js';
import { createHttpApp } from './http.js';
import { createWorldFromConfig } from './logic/world.js';
import { MAP_CONFIG_VERSION } from '../shared/mapConfig.js';

const TEST_ADMIN_PASSWORD = 'test-admin-password';
const TEST_CSRF_ORIGIN = 'http://127.0.0.1:3000';

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

function extractClassId(state) {
  const classId = typeof state?.classId === 'string' ? state.classId : '';
  return classId || 'fighter';
}

function extractLevel(state) {
  const level = Number(state?.level);
  return Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

vi.mock('./db/accountRepo.js', () => ({
  findAccountByUsernameLower: async (usernameLower) => store.accountsByLower.get(usernameLower) ?? null,
  createAccount: async (account) => {
    if (store.accountsByLower.has(account.usernameLower)) {
      const err = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    }
    const now = new Date();
    const next = {
      ...account,
      createdAt: account.createdAt ?? now,
      lastSignedInAt: account.lastSignedInAt ?? null,
      lastSeenAt: account.lastSeenAt ?? null,
    };
    store.accountsById.set(next.id, next);
    store.accountsByLower.set(next.usernameLower, next);
    return next;
  },
  markAccountSignedIn: async (id, at = new Date()) => {
    const account = store.accountsById.get(id);
    if (!account) return null;
    account.lastSignedInAt = at;
    account.lastSeenAt = at;
    return account;
  },
  updateAccountLastSeen: async (id, lastSeenAt = new Date()) => {
    const account = store.accountsById.get(id);
    if (!account) return null;
    account.lastSeenAt = lastSeenAt;
    return account;
  },
  listAccountsOverview: async ({ page = 1, pageSize = 50 } = {}) => {
    const safePage = Math.max(1, Math.floor(Number(page) || 1));
    const safePageSize = Math.max(10, Math.min(100, Math.floor(Number(pageSize) || 50)));
    const sorted = [...store.accountsById.values()].sort((a, b) => {
      const aSignedIn = Date.parse(String(a.lastSignedInAt ?? '')) || 0;
      const bSignedIn = Date.parse(String(b.lastSignedInAt ?? '')) || 0;
      if (bSignedIn !== aSignedIn) return bSignedIn - aSignedIn;
      return String(a.usernameLower ?? '').localeCompare(String(b.usernameLower ?? ''));
    });

    const start = (safePage - 1) * safePageSize;
    const paged = sorted.slice(start, start + safePageSize);
    const accounts = paged.map((account) => {
      const characters = [...store.charactersById.values()]
        .filter((character) => character.accountId === account.id)
        .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
        .map((character) => ({
          id: character.id,
          name: character.name,
          classId: extractClassId(character.state),
          level: extractLevel(character.state),
          lastSeenAt: character.lastSeenAt ?? null,
          updatedAt: character.updatedAt ?? null,
        }));

      return {
        id: account.id,
        username: account.username,
        createdAt: account.createdAt ?? null,
        lastSignedInAt: account.lastSignedInAt ?? null,
        lastSeenAt: account.lastSeenAt ?? null,
        characters,
      };
    });

    return {
      page: safePage,
      pageSize: safePageSize,
      totalAccounts: sorted.length,
      totalCharacters: store.charactersById.size,
      accounts,
    };
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
  const methodName = String(method).toUpperCase();
  const hasOriginHeader = Object.keys(headers).some((key) => key.toLowerCase() === 'origin');
  const hasFetchSiteHeader = Object.keys(headers).some((key) => key.toLowerCase() === 'sec-fetch-site');
  if (methodName !== 'GET' && methodName !== 'HEAD') {
    if (!hasOriginHeader) headers.origin = TEST_CSRF_ORIGIN;
    if (!hasFetchSiteHeader) headers['sec-fetch-site'] = 'same-origin';
  }
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

async function requestText(baseUrl, route, { cookie, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders ?? {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${baseUrl}${route}`, { headers });
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

function createTestConfig(overrides = {}) {
  return getServerConfig({
    HOST: '127.0.0.1',
    PORT: '3000',
    ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    ...overrides,
  });
}

async function unlockAdmin(baseUrl, password = TEST_ADMIN_PASSWORD) {
  const unlock = await requestJson(baseUrl, '/admin/auth/unlock', {
    method: 'POST',
    body: { password },
  });
  const cookie = unlock.res.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { unlock, cookie };
}

describe('HTTP auth lifecycle integration', () => {
  beforeEach(() => {
    resetStore();
  });

  it('supports signup/login/logout and character CRUD + ws ticket', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig();
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
      const signupSetCookie = signup.res.headers.get('set-cookie') ?? '';
      const signupCookie = signup.res.headers.get('set-cookie')?.split(';')[0];
      expect(signupCookie).toContain(`${config.sessionCookieName}=`);
      expect(signupSetCookie).toContain('HttpOnly');
      expect(signupSetCookie).toContain('SameSite=Lax');
      expect(signupSetCookie).toContain('Path=/');
      const signupToken = signupCookie?.split('=')[1];
      expect(typeof signupToken).toBe('string');

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

      const csrfBlocked = await requestJson(baseUrl, '/api/ws-ticket', {
        method: 'POST',
        cookie: signupCookie,
        headers: {
          origin: '',
        },
        body: { characterId },
      });
      expect(csrfBlocked.res.status).toBe(403);

      const crossSiteBlocked = await requestJson(baseUrl, '/api/ws-ticket', {
        method: 'POST',
        cookie: signupCookie,
        headers: {
          origin: TEST_CSRF_ORIGIN,
          'sec-fetch-site': 'cross-site',
        },
        body: { characterId },
      });
      expect(crossSiteBlocked.res.status).toBe(403);

      const bearerBypass = await requestJson(baseUrl, '/api/ws-ticket', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${signupToken}`,
          origin: '',
        },
        body: { characterId },
      });
      expect(bearerBypass.res.status).toBe(200);

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
      const loginSetCookie = login.res.headers.get('set-cookie') ?? '';
      const loginCookie = login.res.headers.get('set-cookie')?.split(';')[0];
      expect(loginCookie).toContain(`${config.sessionCookieName}=`);
      expect(loginSetCookie).toContain('HttpOnly');
      expect(loginSetCookie).toContain('SameSite=Lax');

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
    const config = createTestConfig();
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
  it('guards new routes with admin session auth', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig();
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
        '/admin/accounts-overview',
        '/admin/designer-state?zone=world-map',
        '/admin/prefabs?zone=world-map',
        '/admin/comments?zone=world-map',
        '/admin/locks?zone=world-map',
        '/admin/audit?zone=world-map',
      ];

      for (const route of routes) {
        const unauthorized = await requestJson(baseUrl, route);
        expect(unauthorized.res.status).toBe(401);
      }

      const { unlock, cookie } = await unlockAdmin(baseUrl);
      expect(unlock.res.status).toBe(200);

      const ok = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie });
      expect(ok.res.status).toBe(200);
      expect(ok.payload?.zoneKey).toBe('world-map');

      const accountsOverviewOk = await requestJson(baseUrl, '/admin/accounts-overview', { cookie });
      expect(accountsOverviewOk.res.status).toBe(200);
      expect(Array.isArray(accountsOverviewOk.payload?.accounts)).toBe(true);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('returns paginated accounts overview sorted by recent sign-in with character details', async () => {
    resetStore();
    const files = createTempAdminFiles();
    const config = createTestConfig();
    const world = createWorldFromConfig(buildMapConfig());
    const players = new Map([
      ['char-0', { accountId: 'acct-0' }],
      ['char-5', { accountId: 'acct-5' }],
    ]);

    const signedInBase = Date.parse('2026-02-24T10:00:00Z');
    for (let i = 0; i < 12; i += 1) {
      const accountId = `acct-${i}`;
      const username = `user_${String(i).padStart(2, '0')}`;
      const lastSignedInAt = new Date(signedInBase - i * 60_000);
      const createdAt = new Date(signedInBase - (i + 100) * 60_000);
      const lastSeenAt = new Date(signedInBase - i * 55_000);
      const account = {
        id: accountId,
        username,
        usernameLower: username.toLowerCase(),
        passwordHash: 'hash',
        passwordSalt: 'salt',
        createdAt,
        lastSignedInAt,
        lastSeenAt,
      };
      store.accountsById.set(accountId, account);
      store.accountsByLower.set(account.usernameLower, account);

      const character = {
        id: `char-${i}`,
        accountId,
        name: `Hero ${i}`,
        nameLower: `hero ${i}`,
        state: {
          classId: i % 2 === 0 ? 'fighter' : 'mage',
          level: i + 1,
        },
        lastSeenAt,
        updatedAt: new Date(signedInBase - i * 53_000),
      };
      store.charactersById.set(character.id, character);
      store.charactersByLower.set(character.nameLower, character);
    }

    const app = createHttpApp({
      config,
      world,
      players,
      resources: [],
      mobs: [],
      spawner: { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startServer(app);
    try {
      const { cookie } = await unlockAdmin(baseUrl);

      const pageOne = await requestJson(baseUrl, '/admin/accounts-overview?page=1&pageSize=1', { cookie });
      expect(pageOne.res.status).toBe(200);
      expect(pageOne.payload?.pagination).toMatchObject({
        page: 1,
        pageSize: 10,
        totalAccounts: 12,
        totalPages: 2,
        hasPrev: false,
        hasNext: true,
      });
      expect(pageOne.payload?.totals).toMatchObject({
        totalCharacters: 12,
        onlineCharacters: 2,
      });
      expect(pageOne.payload?.accounts?.length).toBe(10);
      expect(pageOne.payload?.accounts?.[0]?.id).toBe('acct-0');
      expect(pageOne.payload?.accounts?.[0]?.isOnline).toBe(true);
      expect(pageOne.payload?.accounts?.[0]?.onlineCharacterCount).toBe(1);
      expect(pageOne.payload?.accounts?.[0]?.characterCount).toBe(1);
      expect(pageOne.payload?.accounts?.[0]?.characters?.[0]).toMatchObject({
        id: 'char-0',
        classId: 'fighter',
        level: 1,
        isOnline: true,
      });

      const pageTwo = await requestJson(baseUrl, '/admin/accounts-overview?page=2&pageSize=1', { cookie });
      expect(pageTwo.res.status).toBe(200);
      expect(pageTwo.payload?.pagination).toMatchObject({
        page: 2,
        pageSize: 10,
        totalAccounts: 12,
        totalPages: 2,
        hasPrev: true,
        hasNext: false,
      });
      expect(pageTwo.payload?.accounts?.length).toBe(2);
      expect(pageTwo.payload?.accounts?.[0]?.id).toBe('acct-10');
      expect(pageTwo.payload?.accounts?.[1]?.id).toBe('acct-11');
      expect(pageTwo.payload?.accounts?.[1]?.characters?.[0]?.isOnline).toBe(false);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('supports admin cookie unlock/session/logout and patches html/json split', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig({
      ADMIN_SESSION_IDLE_TIMEOUT_MS: '5000',
    });
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
      const unlockNoOrigin = await requestJson(baseUrl, '/admin/auth/unlock', {
        method: 'POST',
        headers: { origin: '' },
        body: { password: TEST_ADMIN_PASSWORD },
      });
      expect(unlockNoOrigin.res.status).toBe(403);

      const unlockCrossSite = await requestJson(baseUrl, '/admin/auth/unlock', {
        method: 'POST',
        headers: {
          origin: TEST_CSRF_ORIGIN,
          'sec-fetch-site': 'cross-site',
        },
        body: { password: TEST_ADMIN_PASSWORD },
      });
      expect(unlockCrossSite.res.status).toBe(403);

      const unlockFail = await requestJson(baseUrl, '/admin/auth/unlock', {
        method: 'POST',
        body: { password: 'bad' },
      });
      expect(unlockFail.res.status).toBe(401);

      const unlock = await requestJson(baseUrl, '/admin/auth/unlock', {
        method: 'POST',
        body: { password: TEST_ADMIN_PASSWORD },
      });
      expect(unlock.res.status).toBe(200);
      expect(unlock.payload).toEqual({ ok: true });

      const adminSetCookie = unlock.res.headers.get('set-cookie') ?? '';
      const cookie = unlock.res.headers.get('set-cookie')?.split(';')[0] ?? '';
      expect(cookie).toContain(`${config.adminSessionCookieName}=`);
      expect(adminSetCookie).toContain('HttpOnly');
      expect(adminSetCookie).toContain('SameSite=Strict');
      expect(adminSetCookie).toContain('Path=/admin');
      const adminSessionToken = cookie.split('=')[1] ?? '';
      expect(adminSessionToken.length).toBeGreaterThan(0);

      const sessionOk = await requestJson(baseUrl, '/admin/auth/session', {
        cookie,
      });
      expect(sessionOk.res.status).toBe(200);
      expect(sessionOk.payload).toEqual({ ok: true });

      const stateOk = await requestJson(baseUrl, '/admin/state', {
        cookie,
      });
      expect(stateOk.res.status).toBe(200);

      const accountsOverviewOk = await requestJson(baseUrl, '/admin/accounts-overview', {
        cookie,
      });
      expect(accountsOverviewOk.res.status).toBe(200);

      const designerOk = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        cookie,
      });
      expect(designerOk.res.status).toBe(200);

      const patchesHtml = await requestText(baseUrl, '/admin/patches', {
        cookie,
      });
      expect(patchesHtml.res.status).toBe(200);
      expect(patchesHtml.text).toContain('Patch Manager');

      const patchesJson = await requestJson(baseUrl, '/admin/patches?zone=world-map', {
        cookie,
        headers: { 'x-admin-api': '1' },
      });
      expect(patchesJson.res.status).toBe(200);
      expect(Array.isArray(patchesJson.payload?.patches)).toBe(true);

      const mutatingViaSessionHeader = await requestJson(baseUrl, '/admin/locks/zone?zone=world-map', {
        method: 'POST',
        headers: {
          origin: '',
          'x-admin-session': adminSessionToken,
          'x-admin-api': '1',
          'x-admin-alias': 'alice',
        },
        body: { action: 'acquire', reason: 'test' },
      });
      expect(mutatingViaSessionHeader.res.status).toBe(200);

      const logout = await requestJson(baseUrl, '/admin/auth/logout', {
        method: 'POST',
        cookie,
      });
      expect(logout.res.status).toBe(200);
      expect(logout.payload).toEqual({ ok: true });

      const logoutCsrfBlocked = await requestJson(baseUrl, '/admin/auth/logout', {
        method: 'POST',
        cookie,
        headers: { origin: '' },
      });
      expect(logoutCsrfBlocked.res.status).toBe(403);

      const stateAfterLogout = await requestJson(baseUrl, '/admin/state', {
        cookie,
      });
      expect(stateAfterLogout.res.status).toBe(401);

      const accountsOverviewAfterLogout = await requestJson(baseUrl, '/admin/accounts-overview', {
        cookie,
      });
      expect(accountsOverviewAfterLogout.res.status).toBe(401);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('expires admin cookie session after idle timeout', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig({
      ADMIN_SESSION_IDLE_TIMEOUT_MS: '20',
    });
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
      const unlock = await requestJson(baseUrl, '/admin/auth/unlock', {
        method: 'POST',
        body: { password: TEST_ADMIN_PASSWORD },
      });
      expect(unlock.res.status).toBe(200);

      const cookie = unlock.res.headers.get('set-cookie')?.split(';')[0] ?? '';
      expect(cookie).toContain(`${config.adminSessionCookieName}=`);

      const initialState = await requestJson(baseUrl, '/admin/state', { cookie });
      expect(initialState.res.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const afterIdle = await requestJson(baseUrl, '/admin/state', { cookie });
      expect(afterIdle.res.status).toBe(401);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('returns revision and lock conflicts', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig();
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
      const { cookie } = await unlockAdmin(baseUrl);
      const headers = { 'x-admin-alias': 'alice', 'x-admin-api': '1' };
      const initial = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(initial.res.status).toBe(200);

      const firstSave = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        method: 'PUT',
        cookie,
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
        cookie,
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
        cookie,
        headers,
        body: { action: 'acquire', reason: 'editing prefabs' },
      });
      expect(acquireLock.res.status).toBe(200);

      const blockedCreate = await requestJson(baseUrl, '/admin/prefabs?zone=world-map', {
        method: 'POST',
        cookie,
        headers: { 'x-admin-alias': 'bob', 'x-admin-api': '1' },
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

  it('allows larger admin JSON payloads than global payload limit', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig({
      MAX_PAYLOAD_BYTES: '1024',
      ADMIN_MAX_PAYLOAD_BYTES: '65536',
    });
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
      const { cookie } = await unlockAdmin(baseUrl);
      const headers = { 'x-admin-alias': 'alice', 'x-admin-api': '1' };
      const initial = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(initial.res.status).toBe(200);

      const longComment = 'x'.repeat(8_000);
      const save = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', {
        method: 'PUT',
        cookie,
        headers,
        body: {
          expectedRevision: initial.payload.revision,
          zoneState: {
            ...initial.payload.zoneState,
            comments: [
              {
                id: 'comment-large',
                x: 0,
                y: 0,
                z: 0,
                text: longComment,
                status: 'open',
                alias: 'alice',
                t: new Date().toISOString(),
              },
            ],
          },
        },
      });
      expect(save.res.status).toBe(200);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });

  it('publishes and rolls back patch snapshots', async () => {
    const files = createTempAdminFiles();
    const config = createTestConfig();
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
      const { cookie } = await unlockAdmin(baseUrl);
      const headers = { 'x-admin-alias': 'alice', 'x-admin-api': '1' };
      const state = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(state.res.status).toBe(200);

      const createPatch = await requestJson(baseUrl, '/admin/patches?zone=world-map', {
        method: 'POST',
        cookie,
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
        { method: 'POST', cookie, headers }
      );
      expect(requestApproval.res.status).toBe(200);

      const approve = await requestJson(baseUrl, `/admin/patches/${patchId}/approve?zone=world-map`, {
        method: 'POST',
        cookie,
        headers,
      });
      expect(approve.res.status).toBe(200);

      const publish = await requestJson(baseUrl, `/admin/patches/${patchId}/publish?zone=world-map`, {
        method: 'POST',
        cookie,
        headers,
      });
      expect(publish.res.status).toBe(200);
      expect(publish.payload).toEqual({ ok: true, restartRequired: true });

      const publishedMap = readJson(files.mapPath);
      expect(publishedMap.mapSize).toBe(120);

      const afterPublish = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(afterPublish.payload?.zoneState?.navAreas?.some((entry) => entry.id === 'lane-main')).toBe(true);

      const rollback = await requestJson(baseUrl, `/admin/patches/${patchId}/rollback?zone=world-map`, {
        method: 'POST',
        cookie,
        headers,
      });
      expect(rollback.res.status).toBe(200);
      expect(rollback.payload).toEqual({ ok: true, restartRequired: true });

      const rolledBackMap = readJson(files.mapPath);
      expect(rolledBackMap.mapSize).toBe(40);

      const afterRollback = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(afterRollback.payload?.zoneState?.navAreas?.some((entry) => entry.id === 'lane-main')).toBe(false);
    } finally {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      files.cleanup();
    }
  });
});
