import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMockStore,
  createWorldFixture,
  buildHttpApp,
  buildServerConfig,
  extractSetCookie,
  installHttpRepoMocks,
  makeTempAssetFile,
  requestJson,
  resetMockStore,
  startHttpTestServer,
  stopHttpTestServer,
  TEST_CSRF_ORIGIN,
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

describe('HTTP auth lifecycle integration', () => {
  it('supports signup/login/logout and character CRUD + ws ticket', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig();
    const world = createWorldFixture({
      vendors: [{ id: 'vendor-1', name: 'Vendor', x: 6, z: 0 }],
    });
    const app = await buildHttpApp({
      config,
      world,
      mapConfigPath: files.mapPath,
      designerStatePath: files.designerStatePath,
    });

    const { server, baseUrl } = await startHttpTestServer(app);
    try {
      const signup = await requestJson(baseUrl, '/api/auth/signup', {
        method: 'POST',
        body: { username: 'alpha_user', password: 'password123' },
      });
      expect(signup.res.status).toBe(200);
      expect(signup.payload?.account?.username).toBe('alpha_user');
      expect(signup.payload).not.toHaveProperty('token');
      const signupSetCookie = signup.res.headers.get('set-cookie') ?? '';
      const signupCookie = extractSetCookie(signup.res);
      expect(signupCookie).toContain(`${config.sessionCookieName}=`);
      expect(signupSetCookie).toContain('HttpOnly');
      expect(signupSetCookie).toContain('SameSite=Lax');
      expect(signupSetCookie).toContain('Path=/');
      const signupToken = signupCookie.split('=')[1];
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
      expect(typeof ticket.payload?.ticket).toBe('string');
      expect(ticket.payload?.ticket?.length ?? 0).toBeGreaterThan(10);

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

      let ticketLimitReached = false;
      for (let i = 0; i < 30; i += 1) {
        const attempt = await requestJson(baseUrl, '/api/ws-ticket', {
          method: 'POST',
          cookie: signupCookie,
          body: { characterId },
        });
        if (attempt.res.status === 429) {
          ticketLimitReached = true;
          expect(attempt.payload?.error).toContain('Too many pending connection tickets');
          break;
        }
      }
      expect(ticketLimitReached).toBe(true);

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
      expect(login.payload).not.toHaveProperty('token');
      const loginSetCookie = login.res.headers.get('set-cookie') ?? '';
      const loginCookie = extractSetCookie(login.res);
      expect(loginCookie).toContain(`${config.sessionCookieName}=`);
      expect(loginSetCookie).toContain('HttpOnly');
      expect(loginSetCookie).toContain('SameSite=Lax');

      const listAfterLogin = await requestJson(baseUrl, '/api/characters', {
        cookie: loginCookie,
      });
      expect(listAfterLogin.res.status).toBe(200);
      expect(listAfterLogin.payload).toEqual({ characters: [] });
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });

  it('includes auth token in signup and login responses when EXPOSE_AUTH_TOKEN is enabled', async () => {
    const files = createAdminFiles();
    const config = buildServerConfig({
      EXPOSE_AUTH_TOKEN: 'true',
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
      const signup = await requestJson(baseUrl, '/api/auth/signup', {
        method: 'POST',
        body: { username: 'token_user', password: 'password123' },
      });
      expect(signup.res.status).toBe(200);
      expect(signup.payload?.account).toMatchObject({ username: 'token_user' });
      expect(typeof signup.payload?.token).toBe('string');
      expect(signup.payload?.token?.length ?? 0).toBeGreaterThan(0);

      const login = await requestJson(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: { username: 'token_user', password: 'password123' },
      });
      expect(login.res.status).toBe(200);
      expect(login.payload?.account).toMatchObject({ username: 'token_user' });
      expect(typeof login.payload?.token).toBe('string');
      expect(login.payload?.token?.length ?? 0).toBeGreaterThan(0);
    } finally {
      await stopHttpTestServer(server);
      files.cleanup();
    }
  });
});
