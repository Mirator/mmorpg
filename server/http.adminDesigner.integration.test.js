import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_ADMIN_PASSWORD,
  TEST_CSRF_ORIGIN,
  buildHttpApp,
  buildServerConfig,
  createMockStore,
  createWorldFixture,
  installHttpRepoMocks,
  makeTempAssetFile,
  requestJson,
  requestText,
  resetMockStore,
  startHttpTestServer,
  stopHttpTestServer,
  unlockAdmin,
} from './test/httpHarness.js';

const store = createMockStore();
installHttpRepoMocks(store);

function createAdminFiles() {
  const mapFile = makeTempAssetFile(
    JSON.stringify(
      {
        version: 2,
        mapSize: 40,
        base: { x: 0, z: 0, radius: 4 },
        spawnPoints: [{ x: 0, z: 0 }],
        obstacles: [],
        structures: [],
        resourceNodes: [],
        vendors: [],
        mobSpawns: [],
      },
      null,
      2
    ),
    'world-map.json'
  );
  const designerFile = makeTempAssetFile('{}', 'world-map.designer.json');
  return {
    mapPath: mapFile.filePath,
    designerStatePath: designerFile.filePath,
    cleanup() {
      mapFile.cleanup();
      designerFile.cleanup();
    },
  };
}

beforeEach(() => {
  resetMockStore(store);
});

describe('admin designer APIs', () => {
  it('guards new routes with admin session auth', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('returns paginated accounts overview sorted by recent sign-in with character details', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture();
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

    const app = await buildHttpApp({
      config,
      world,
      players,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('supports admin cookie unlock/session/logout and patches html/json split', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig({
      ADMIN_SESSION_IDLE_TIMEOUT_MS: '5000',
    });
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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

      const { unlock, cookie } = await unlockAdmin(baseUrl);
      expect(unlock.res.status).toBe(200);
      expect(unlock.payload).toEqual({ ok: true });

      const adminSetCookie = unlock.res.headers.get('set-cookie') ?? '';
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
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('expires admin cookie session after idle timeout', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig({
      ADMIN_SESSION_IDLE_TIMEOUT_MS: '20',
    });
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
    try {
      const { unlock, cookie } = await unlockAdmin(baseUrl);
      expect(unlock.res.status).toBe(200);
      expect(cookie).toContain(`${config.adminSessionCookieName}=`);

      const initialState = await requestJson(baseUrl, '/admin/state', { cookie });
      expect(initialState.res.status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      const afterIdle = await requestJson(baseUrl, '/admin/state', { cookie });
      expect(afterIdle.res.status).toBe(401);
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('returns revision and lock conflicts', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('allows larger admin JSON payloads than global payload limit', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig({
      MAX_PAYLOAD_BYTES: '1024',
      ADMIN_MAX_PAYLOAD_BYTES: '65536',
    });
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('publishes and rolls back patch snapshots', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture();
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
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
            mapConfig: {
              version: 2,
              mapSize: 120,
              base: { x: 0, z: 0, radius: 4 },
              spawnPoints: [{ x: 0, z: 0 }],
              obstacles: [],
              structures: [],
              resourceNodes: [],
              vendors: [],
              mobSpawns: [],
            },
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

      const publishedMap = JSON.parse(fs.readFileSync(files.mapPath, 'utf8'));
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

      const rolledBackMap = JSON.parse(fs.readFileSync(files.mapPath, 'utf8'));
      expect(rolledBackMap.mapSize).toBe(40);

      const afterRollback = await requestJson(baseUrl, '/admin/designer-state?zone=world-map', { cookie, headers });
      expect(afterRollback.payload?.zoneState?.navAreas?.some((entry) => entry.id === 'lane-main')).toBe(false);
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });
});
