// @ts-check
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { getServerConfig } from '../config.js';
import { createWorldFromConfig } from '../logic/world.js';
import { MAP_CONFIG_VERSION } from '../../shared/mapConfig.js';

export const TEST_ADMIN_PASSWORD = 'test-admin-password';
export const TEST_CSRF_ORIGIN = 'http://127.0.0.1:3000';

const mockState = vi.hoisted(() => ({
  current: null,
  issuedByAccount: new Map(),
}));

function getStore() {
  if (!mockState.current) {
    mockState.current = createMockStore();
  }
  return mockState.current;
}

function extractClassId(state) {
  const classId = typeof state?.classId === 'string' ? state.classId : '';
  return classId || 'fighter';
}

function extractLevel(state) {
  const level = Number(state?.level);
  return Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

vi.mock('../db/accountRepo.js', () => ({
  findAccountByUsernameLower: async (usernameLower) => getStore().accountsByLower.get(usernameLower) ?? null,
  createAccount: async (account) => {
    const store = getStore();
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
    const account = getStore().accountsById.get(id);
    if (!account) return null;
    account.lastSignedInAt = at;
    account.lastSeenAt = at;
    return account;
  },
  updateAccountLastSeen: async (id, lastSeenAt = new Date()) => {
    const account = getStore().accountsById.get(id);
    if (!account) return null;
    account.lastSeenAt = lastSeenAt;
    return account;
  },
  listAccountsOverview: async ({ page = 1, pageSize = 50 } = {}) => {
    const store = getStore();
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

vi.mock('../db/sessionRepo.js', () => ({
  createSession: async (session) => {
    const next = { ...session };
    getStore().sessionsById.set(next.id, next);
    return next;
  },
  getSessionWithAccount: async (id) => {
    const store = getStore();
    const session = store.sessionsById.get(id);
    if (!session) return null;
    const account = store.accountsById.get(session.accountId) ?? null;
    return { ...session, account, accountId: session.accountId };
  },
  touchSession: async (id, lastSeenAt = new Date()) => {
    const session = getStore().sessionsById.get(id);
    if (!session) return null;
    session.lastSeenAt = lastSeenAt;
    return session;
  },
  deleteSession: async (id) => {
    const existed = getStore().sessionsById.delete(id);
    if (!existed) {
      const err = new Error('Not found');
      err.code = 'P2025';
      throw err;
    }
    return { id };
  },
}));

vi.mock('../db/playerRepo.js', () => ({
  createCharacter: async (character) => {
    const store = getStore();
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
    const store = getStore();
    const found = store.charactersById.get(id);
    if (!found || found.accountId !== accountId) {
      return { count: 0 };
    }
    store.charactersById.delete(id);
    store.charactersByLower.delete(found.nameLower);
    return { count: 1 };
  },
  findCharacterById: async (id) => getStore().charactersById.get(id) ?? null,
  findCharacterByNameLower: async (nameLower) => getStore().charactersByLower.get(nameLower) ?? null,
  listCharacters: async (accountId) =>
    [...getStore().charactersById.values()]
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

vi.mock('../wsTicket.js', () => ({
  createTicket: ({ accountId, characterId }) => {
    const maxPerAccount = 20;
    const issued = mockState.issuedByAccount.get(accountId) ?? 0;
    if (issued >= maxPerAccount) {
      return null;
    }
    const next = issued + 1;
    mockState.issuedByAccount.set(accountId, next);
    return `ticket-${accountId}-${characterId}-${next}`;
  },
}));

export function createMockStore() {
  return {
    accountsById: new Map(),
    accountsByLower: new Map(),
    sessionsById: new Map(),
    charactersById: new Map(),
    charactersByLower: new Map(),
  };
}

export function resetMockStore(store) {
  store.accountsById.clear();
  store.accountsByLower.clear();
  store.sessionsById.clear();
  store.charactersById.clear();
  store.charactersByLower.clear();
  mockState.issuedByAccount.clear();
}

export function installHttpRepoMocks(store) {
  mockState.current = store;
  mockState.issuedByAccount.clear();
}

export async function startHttpTestServer(app) {
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

export async function stopHttpTestServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

export async function requestJson(baseUrl, route, { method = 'GET', body, cookie, headers: extraHeaders } = {}) {
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

export async function requestText(baseUrl, route, { cookie, headers: extraHeaders } = {}) {
  const headers = { ...(extraHeaders ?? {}) };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${baseUrl}${route}`, { headers });
  const text = await res.text();
  return { res, text };
}

export function extractSetCookie(response) {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
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

export function buildServerConfig(overrides = {}) {
  return getServerConfig({
    HOST: '127.0.0.1',
    PORT: '3000',
    ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    ...overrides,
  });
}

export async function buildHttpApp({
  config,
  configOverrides = {},
  world,
  worldOverrides = {},
  players = new Map(),
  resources = [],
  mobs = [],
  spawner = { getSpawnPoint: () => ({ x: 0, y: 0, z: 0 }) },
  mapConfigPath,
  designerStatePath,
  onApplyMapConfig,
  now,
} = {}) {
  const { createHttpApp } = await import('../http.js');
  return createHttpApp({
    config: config ?? buildServerConfig(configOverrides),
    world: world ?? createWorldFixture(worldOverrides),
    players,
    resources,
    mobs,
    spawner,
    mapConfigPath,
    designerStatePath,
    onApplyMapConfig,
    now,
  });
}

export function createWorldFixture(overrides = {}) {
  return createWorldFromConfig(buildMapConfig(overrides));
}

export function makeTempAssetFile(contents = '{}', fileName = 'asset.json') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-admin-'));
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, contents, 'utf8');
  return {
    filePath,
    cleanup() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

export async function unlockAdmin(baseUrl, password = TEST_ADMIN_PASSWORD) {
  const unlock = await requestJson(baseUrl, '/admin/auth/unlock', {
    method: 'POST',
    body: { password },
  });
  return { unlock, cookie: extractSetCookie(unlock.res) };
}
