// @ts-check
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAdminStateHandler } from './admin.js';
import { createMapConfigHandlers } from './mapConfig.js';
import { createMapDesignerHandlers } from './mapDesignerState.js';
import { sendDbError } from './httpErrors.js';
import { createCsrfGuard } from './csrfGuard.js';
import {
  generateId,
  generateSessionToken,
  hashPassword,
  isValidPassword,
  normalizeCharacterName,
  normalizeUsername,
  SESSION_TTL_MS,
  verifyPassword,
} from './auth.js';
import {
  createAccount,
  findAccountByUsernameLower,
  listAccountsOverview,
  markAccountSignedIn,
  updateAccountLastSeen,
} from './db/accountRepo.js';
import { createSession, deleteSession, getSessionWithAccount, touchSession } from './db/sessionRepo.js';
import {
  createCharacter,
  deleteCharacter,
  findCharacterById,
  findCharacterByNameLower,
  listCharacters,
} from './db/playerRepo.js';
import { createBasePlayerState } from './logic/players.js';
import { serializePlayerState } from './db/playerState.js';
import { isValidClassId } from '../shared/classes.js';
import { createTicket } from './wsTicket.js';
import { getCookieValue, normalizeId } from './authParsing.js';
import { createAdminSessionStore } from './adminSession.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const ADMIN_DIR = path.resolve(__dirname, '../admin');
const SHARED_DIR = path.resolve(__dirname, '../shared');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../package.json');

let clientAssetVersion = 'dev';
try {
  const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  if (typeof packageJson?.version === 'string' && packageJson.version.trim()) {
    clientAssetVersion = packageJson.version.trim();
  }
} catch {
  clientAssetVersion = 'dev';
}

/** @typedef {import('./types/domain.d.ts').AuthAccount} AuthAccount */
/** @typedef {import('./types/domain.d.ts').HttpConfig} HttpConfig */
/** @typedef {import('./types/domain.d.ts').HttpRequestLike} HttpRequestLike */
/** @typedef {import('./types/domain.d.ts').HttpResponseLike} HttpResponseLike */
/** @typedef {import('./types/domain.d.ts').MobEntity} MobEntity */
/** @typedef {import('./types/domain.d.ts').NextFunctionLike} NextFunctionLike */
/** @typedef {import('./types/domain.d.ts').PlayerMap} PlayerMap */
/** @typedef {import('./types/domain.d.ts').ResourceNode} ResourceNode */
/** @typedef {import('./types/domain.d.ts').SpawnerLike} SpawnerLike */

/** @typedef {Error & { code?: string }} DbError */

/**
 * @param {unknown} err
 * @returns {err is DbError}
 */
function isUniqueConstraintError(err) {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    /** @type {{ code?: unknown }} */ (err).code === 'P2002'
  );
}

/**
 * @param {HttpResponseLike} res
 * @param {number} status
 * @param {string} message
 */
function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {HttpRequestLike} req
 * @returns {string | null}
 */
function getBearerToken(req) {
  const auth = typeof req.get === 'function' ? req.get('authorization') : '';
  if (!auth || typeof auth !== 'string') return null;
  const prefix = 'Bearer ';
  if (!auth.startsWith(prefix)) return null;
  const token = auth.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * @param {{
 *   config: HttpConfig,
 *   world: unknown,
 *   players: PlayerMap,
 *   resources: ResourceNode[],
 *   mobs: MobEntity[],
 *   spawner: SpawnerLike,
 *   mapConfigPath: string,
 *   designerStatePath: string,
 *   onApplyMapConfig?: ((config?: unknown) => Promise<unknown>) | null,
 *   now?: () => number
 * }} deps
 */
export function createHttpApp({
  config,
  world,
  players,
  resources,
  mobs,
  spawner,
  mapConfigPath,
  designerStatePath,
  onApplyMapConfig = null,
  now = Date.now,
}) {
  const app = express();
  app.disable('x-powered-by');
  const disableRateLimitsForE2E = process.env.E2E_TEST === 'true';

  /**
   * Keep shared-server E2E runs from throttling static assets or auth calls.
   * @param {Parameters<typeof rateLimit>[0]} options
   */
  const createOptionalRateLimit = (options) => {
    if (disableRateLimitsForE2E) {
      return (
        /** @type {HttpRequestLike} */ _req,
        /** @type {HttpResponseLike} */ _res,
        /** @type {NextFunctionLike} */ next
      ) => next();
    }
    return rateLimit(options);
  };

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'frame-ancestors': ["'none'"],
          'img-src': ["'self'", 'data:'],
          'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
          'script-src-elem': ["'self'", 'https://cdn.jsdelivr.net'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'style-src-elem': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'connect-src': ["'self'", 'data:', 'blob:', 'https://cdn.jsdelivr.net', 'ws:', 'wss:'],
          'object-src': ["'none'"],
        },
      },
    })
  );
  // Apply 50% increase globally, then 100% increase on localhost
  const generalRateLimitMax = Math.round(120 * 1.5 * (config.isLocalhost ? 2 : 1));
  app.use(
    createOptionalRateLimit({
      windowMs: 60_000,
      max: generalRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  const adminJsonLimit = Math.max(config.maxPayloadBytes, config.adminMaxPayloadBytes);
  app.use(
    '/admin',
    express.json({
      limit: adminJsonLimit,
    })
  );
  app.use(
    express.json({
      limit: config.maxPayloadBytes,
    })
  );

  // Apply 50% increase globally, then 100% increase on localhost
  const authRateLimitMax = Math.round(20 * 1.5 * (config.isLocalhost ? 2 : 1));
  const authLimiter = createOptionalRateLimit({
    windowMs: 5 * 60_000,
    max: authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again soon.' },
    keyGenerator: (req) => {
      const request = /** @type {HttpRequestLike} */ (/** @type {unknown} */ (req));
      const ip = request.ip ?? 'unknown';
      const username =
        typeof request.body?.username === 'string'
          ? request.body.username.toLowerCase().trim()
          : '';
      return `${ip}:${username || 'unknown'}`;
    },
  });
  const adminUnlockLimiter = createOptionalRateLimit({
    windowMs: 5 * 60_000,
    max: config.isLocalhost ? 20 : 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin unlock attempts, try again soon.' },
    keyGenerator: (req) => {
      const request = /** @type {HttpRequestLike} */ (/** @type {unknown} */ (req));
      return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    },
  });

  const adminSessions = createAdminSessionStore({
    password: config.adminPassword,
    cookieName: config.adminSessionCookieName,
    idleTimeoutMs: config.adminSessionIdleTimeoutMs,
    now,
  });
  const csrfGuard = createCsrfGuard({
    allowedOrigins: config.allowedOrigins,
  });

  const createCookieController = (
    /** @type {string} */ name,
    /** @type {Parameters<HttpResponseLike['cookie']>[2]} */ baseOptions,
    /** @type {number | undefined} */ maxAge
  ) => {
    const setOptions = maxAge === undefined ? baseOptions : { ...baseOptions, maxAge };
    return {
      set: (/** @type {HttpResponseLike} */ res, /** @type {string} */ token) =>
        res.cookie(name, token, setOptions),
      clear: (/** @type {HttpResponseLike} */ res) => res.clearCookie(name, baseOptions),
    };
  };

  const sessionCookie = createCookieController(
    config.sessionCookieName,
    {
      httpOnly: true,
      sameSite: config.sessionCookieSameSite,
      secure: config.sessionCookieSecure,
      path: '/',
    },
    SESSION_TTL_MS
  );
  const adminSessionCookie = createCookieController(config.adminSessionCookieName, {
    httpOnly: true,
    sameSite: config.adminSessionCookieSameSite,
    secure: config.adminSessionCookieSecure,
    path: '/admin',
  }, undefined);

  /**
   * @param {HttpRequestLike} req
   */
  function isAdminAuthorizedRequest(req) {
    return adminSessions.hasValidSession(req);
  }

  /**
   * @param {HttpRequestLike} req
   */
  function wantsAdminPatchesApi(req) {
    if (typeof req.get !== 'function') return false;
    return req.get('x-admin-api') === '1';
  }

  const sendAdminPage = (/** @type {string} */ fileName) =>
    (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
      void req;
      res.sendFile(path.join(ADMIN_DIR, fileName));
    };

  /**
   * @param {{
   *   method: 'get' | 'post' | 'put' | 'delete',
   *   path: string,
   *   handler: any,
   *   useCsrf?: boolean
   * }[]} specs
   */
  function registerRouteSpecs(specs) {
    for (const { method, path: routePath, handler, useCsrf = false } of specs) {
      const route = /** @type {any} */ (app)[method];
      route.call(app, routePath, ...(useCsrf ? [csrfGuard, handler] : [handler]));
    }
  }

  const getRequiredAccount = (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    if (req.account) return req.account;
    sendError(res, 401, 'Unauthorized');
    return null;
  };

  const sendAuthSuccess = (
    /** @type {HttpResponseLike} */ res,
    /** @type {{ id: string, username: string }} */ account,
    /** @type {string} */ token
  ) => {
    sessionCookie.set(res, token);
    if (config.exposeAuthToken) {
      res.json({ account, token });
      return;
    }
    res.json({ account });
  };

  const handleRouteFailure = (
    /** @type {HttpResponseLike} */ res,
    /** @type {unknown} */ err,
    /** @type {string} */ logLabel,
    /** @type {string} */ clientMessage
  ) => {
    if (sendDbError(res, err)) return;
    logger.error(logLabel, err);
    sendError(res, 500, clientMessage);
  };

  const createSessionRecord = async (/** @type {string} */ accountId, /** @type {Date} */ now) => {
    const token = generateSessionToken();
    await createSession({
      id: token,
      accountId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastSeenAt: now,
    });
    return token;
  };

  app.get('/favicon.ico', (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    void req;
    res.redirect(302, '/favicon.svg');
  });

  app.get('/client-config.js', (/** @type {HttpRequestLike} */ _req, /** @type {HttpResponseLike} */ res) => {
    const response = /** @type {HttpResponseLike & { type?: (value: string) => HttpResponseLike, setHeader?: (name: string, value: string) => void }} */ (res);
    response.type?.('application/javascript');
    response.setHeader?.('Cache-Control', 'public, max-age=0');
    res.send(
      `window.__MMORPG_CLIENT_CONFIG__ = Object.assign({}, window.__MMORPG_CLIENT_CONFIG__, ${JSON.stringify({
        assetVersion: clientAssetVersion,
      })});\n`
    );
  });

  const adminPageSpecs = [['/admin', 'index.html'], ['/admin/map', 'map.html'], ['/admin/assets', 'assets.html'], ['/admin/events', 'events.html'], ['/admin/nav', 'nav.html'], ['/admin/collab', 'collab.html'], ['/admin/playtest', 'playtest.html']];
  for (const [routePath, fileName] of adminPageSpecs) {
    app.get(routePath, sendAdminPage(fileName));
  }

  const sendPatchesPage = sendAdminPage('patches.html');
  app.get(
    '/admin/patches',
    (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res, /** @type {NextFunctionLike} */ next) => {
      if (wantsAdminPatchesApi(req)) {
        next();
        return;
      }
      sendPatchesPage(req, res);
    }
  );
  app.use('/admin', express.static(ADMIN_DIR));
  app.use('/shared', express.static(SHARED_DIR));
  app.use(
    '/assets',
    express.static(path.join(CLIENT_DIR, 'assets'), {
      setHeaders: (/** @type {any} */ res, /** @type {any} */ _filePath) => {
        const requestUrl = String(res.req?.originalUrl ?? res.req?.url ?? '');
        if (requestUrl.includes('?v=')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.use(express.static(CLIENT_DIR));

  app.post(
    '/admin/auth/unlock',
    csrfGuard,
    adminUnlockLimiter,
    (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const token = adminSessions.issueSessionFromPassword(password);
      if (!token) {
        sendError(res, 401, 'Unauthorized');
        return;
      }
      adminSessionCookie.set(res, token);
      res.json({ ok: true });
    }
  );

  app.get('/admin/auth/session', (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    if (!isAdminAuthorizedRequest(req)) {
      adminSessionCookie.clear(res);
      sendError(res, 401, 'Unauthorized');
      return;
    }
    res.json({ ok: true });
  });

  app.post('/admin/auth/logout', csrfGuard, (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    adminSessions.revokeSessionFromRequest(req);
    adminSessionCookie.clear(res);
    res.json({ ok: true });
  });

  app.get(
    '/admin/state',
    createAdminStateHandler({
      isAuthorized: isAdminAuthorizedRequest,
      world,
      players,
      resources,
      mobs,
    })
  );
  app.get('/admin/accounts-overview', async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    if (!isAdminAuthorizedRequest(req)) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const query = /** @type {{ page?: unknown, pageSize?: unknown }} */ (req.query ?? {});
    const page = Math.max(1, toInt(query.page, 1));
    const pageSize = Math.max(10, Math.min(100, toInt(query.pageSize, 50)));

    try {
      const { totalAccounts, totalCharacters, accounts } = await listAccountsOverview({ page, pageSize });
      const onlineCharactersByAccountId = new Map();
      const onlineCharacterIds = new Set();

      for (const [characterId, player] of players.entries()) {
        if (!player?.accountId) continue;
        onlineCharacterIds.add(characterId);
        onlineCharactersByAccountId.set(
          player.accountId,
          (onlineCharactersByAccountId.get(player.accountId) ?? 0) + 1
        );
      }

      const serializedAccounts = accounts.map((account) => {
        const characters = account.characters.map((/** @type {any} */ character) => ({
          ...character,
          isOnline: onlineCharacterIds.has(character.id),
        }));
        const onlineCharacterCount = onlineCharactersByAccountId.get(account.id) ?? 0;
        return {
          id: account.id,
          username: account.username,
          createdAt: account.createdAt,
          lastSignedInAt: account.lastSignedInAt,
          lastSeenAt: account.lastSeenAt,
          isOnline: onlineCharacterCount > 0,
          onlineCharacterCount,
          characterCount: characters.length,
          characters,
        };
      });

      const totalPages = Math.max(1, Math.ceil(totalAccounts / pageSize));
      const onlineCharactersTotal = [...players.values()].filter((player) => !!player?.accountId).length;
      res.json({
        generatedAt: new Date().toISOString(),
        totals: {
          totalCharacters,
          onlineCharacters: onlineCharactersTotal,
        },
        pagination: {
          page,
          pageSize,
          totalAccounts,
          totalPages,
          hasPrev: page > 1,
          hasNext: page < totalPages,
        },
        accounts: serializedAccounts,
      });
    } catch (err) {
      handleRouteFailure(res, err, 'Admin accounts overview error:', 'Unable to load accounts overview.');
    }
  });

  const mapHandlers = createMapConfigHandlers({
    mapConfigPath,
    isAuthorized: isAdminAuthorizedRequest,
    onAfterSave: onApplyMapConfig,
  });
  const applyMapConfig = onApplyMapConfig ? () => onApplyMapConfig() : null;

  const designerHandlers = createMapDesignerHandlers(/** @type {any} */ ({
    isAuthorized: isAdminAuthorizedRequest,
    mapConfigPath,
    designerStatePath,
    onAfterPublish: applyMapConfig,
    onAfterRollback: applyMapConfig,
  }));
  registerRouteSpecs([
    { method: 'get', path: '/admin/map-config', handler: mapHandlers.getHandler },
    { method: 'put', path: '/admin/map-config', handler: mapHandlers.putHandler, useCsrf: true },
    { method: 'get', path: '/admin/designer-state', handler: designerHandlers.getDesignerState },
    { method: 'put', path: '/admin/designer-state', handler: designerHandlers.putDesignerState, useCsrf: true },
    { method: 'get', path: '/admin/prefabs', handler: designerHandlers.getPrefabs },
    { method: 'post', path: '/admin/prefabs', handler: designerHandlers.postPrefab, useCsrf: true },
    { method: 'put', path: '/admin/prefabs/:id', handler: designerHandlers.putPrefab, useCsrf: true },
    { method: 'delete', path: '/admin/prefabs/:id', handler: designerHandlers.deletePrefab, useCsrf: true },
    { method: 'get', path: '/admin/patches', handler: designerHandlers.getPatches },
    { method: 'post', path: '/admin/patches', handler: designerHandlers.postPatch, useCsrf: true },
    { method: 'post', path: '/admin/patches/:id/request-approval', handler: designerHandlers.postPatchRequestApproval, useCsrf: true },
    { method: 'post', path: '/admin/patches/:id/approve', handler: designerHandlers.postPatchApprove, useCsrf: true },
    { method: 'post', path: '/admin/patches/:id/publish', handler: designerHandlers.postPatchPublish, useCsrf: true },
    { method: 'post', path: '/admin/patches/:id/rollback', handler: designerHandlers.postPatchRollback, useCsrf: true },
    { method: 'get', path: '/admin/comments', handler: designerHandlers.getComments },
    { method: 'post', path: '/admin/comments', handler: designerHandlers.postComment, useCsrf: true },
    { method: 'post', path: '/admin/comments/:id/resolve', handler: designerHandlers.postCommentResolve, useCsrf: true },
    { method: 'get', path: '/admin/locks', handler: designerHandlers.getLocks },
    { method: 'post', path: '/admin/locks/zone', handler: designerHandlers.postZoneLock, useCsrf: true },
    { method: 'post', path: '/admin/locks/layer/:layerId', handler: designerHandlers.postLayerLock, useCsrf: true },
    { method: 'get', path: '/admin/audit', handler: designerHandlers.getAudit },
    { method: 'post', path: '/admin/playtest/session', handler: designerHandlers.postPlaytestSession, useCsrf: true },
  ]);

  app.post('/api/auth/signup', authLimiter, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const normalized = normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!normalized) {
      sendError(res, 400, 'Username must be 3-20 characters (letters, numbers, underscore).');
      return;
    }
    if (!isValidPassword(password)) {
      sendError(res, 400, 'Password must be 8-64 characters.');
      return;
    }

    let existing;
    try {
      existing = await findAccountByUsernameLower(normalized.lower);
    } catch (err) {
      handleRouteFailure(res, err, 'Signup lookup error:', 'Unable to create account.');
      return;
    }
    if (existing) {
      sendError(res, 409, 'Username already taken.');
      return;
    }

    const { hash, salt } = await hashPassword(password);
    const accountId = generateId();
    const now = new Date();

    try {
      await createAccount({
        id: accountId,
        username: normalized.name,
        usernameLower: normalized.lower,
        passwordHash: hash,
        passwordSalt: salt,
        lastSignedInAt: now,
        lastSeenAt: now,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        sendError(res, 409, 'Username already taken.');
        return;
      }
      handleRouteFailure(res, err, 'Signup error:', 'Unable to create account.');
      return;
    }

    try {
      const token = await createSessionRecord(accountId, now);
      sendAuthSuccess(res, { id: accountId, username: normalized.name }, token);
    } catch (err) {
      handleRouteFailure(res, err, 'Session create error:', 'Unable to create session.');
      return;
    }
  });

  app.post('/api/auth/login', authLimiter, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const normalized = normalizeUsername(req.body?.username);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!normalized) {
      sendError(res, 400, 'Invalid username or password.');
      return;
    }
    if (!isValidPassword(password)) {
      sendError(res, 400, 'Invalid username or password.');
      return;
    }

    let account;
    try {
      account = await findAccountByUsernameLower(normalized.lower);
    } catch (err) {
      handleRouteFailure(res, err, 'Login lookup error:', 'Unable to sign in.');
      return;
    }
    if (!account) {
      sendError(res, 401, 'Invalid username or password.');
      return;
    }

    const ok = await verifyPassword(password, account.passwordHash, account.passwordSalt);
    if (!ok) {
      sendError(res, 401, 'Invalid username or password.');
      return;
    }

    const now = new Date();

    try {
      const token = await createSessionRecord(account.id, now);
      await markAccountSignedIn(account.id, now);
      sendAuthSuccess(res, { id: account.id, username: account.username }, token);
    } catch (err) {
      handleRouteFailure(res, err, 'Login session error:', 'Unable to create session.');
      return;
    }
  });

  async function requireAuth(/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res, /** @type {NextFunctionLike} */ next) {
    const token =
      normalizeId(getBearerToken(req)) ??
      normalizeId(getCookieValue(req, config.sessionCookieName));
    if (!token) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    let session;
    try {
      session = await getSessionWithAccount(token);
    } catch (err) {
      handleRouteFailure(res, err, 'Session lookup error:', 'Unable to validate session.');
      return;
    }

    if (!session || !session.account) {
      sessionCookie.clear(res);
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt <= now) {
      deleteSession(token).catch(() => {});
      sessionCookie.clear(res);
      sendError(res, 401, 'Session expired');
      return;
    }

    req.account = session.account;
    req.session = session;
    req.authToken = token;

    touchSession(token, now).catch(() => {});
    updateAccountLastSeen(session.accountId, now).catch(() => {});

    next();
  }

  app.post('/api/auth/logout', requireAuth, csrfGuard, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    if (!getRequiredAccount(req, res)) {
      return;
    }
    if (!req.authToken) {
      sendError(res, 401, 'Unauthorized');
      return;
    }
    try {
      await deleteSession(req.authToken);
    } catch (err) {
      // Ignore if already deleted.
    }
    sessionCookie.clear(res);
    res.json({ ok: true });
  });

  app.post('/api/ws-ticket', requireAuth, csrfGuard, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const account = getRequiredAccount(req, res);
    if (!account) return;
    const characterId = normalizeId(req.body?.characterId);
    if (!characterId) {
      sendError(res, 400, 'Invalid character.');
      return;
    }

    let character;
    try {
      character = await findCharacterById(characterId);
    } catch (err) {
      handleRouteFailure(res, err, 'WS ticket character lookup error:', 'Unable to create ticket.');
      return;
    }

    if (!character || character.accountId !== account.id) {
      sendError(res, 404, 'Character not found.');
      return;
    }

    const ticket = createTicket({
      accountId: account.id,
      characterId: character.id,
    });
    if (!ticket) {
      sendError(res, 429, 'Too many pending connection tickets. Please retry shortly.');
      return;
    }
    res.json({ ticket });
  });

  app.get('/api/characters', requireAuth, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const account = getRequiredAccount(req, res);
    if (!account) return;
    try {
      const characters = await listCharacters(account.id);
      res.json({ characters });
    } catch (err) {
      handleRouteFailure(res, err, 'List characters error:', 'Unable to load characters.');
    }
  });

  app.post('/api/characters', requireAuth, csrfGuard, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const account = getRequiredAccount(req, res);
    if (!account) return;
    const normalized = normalizeCharacterName(req.body?.name);
    const classId = typeof req.body?.classId === 'string' ? req.body.classId : '';
    if (!normalized) {
      sendError(res, 400, 'Character name must be 3-16 letters/numbers/spaces.');
      return;
    }
    if (!isValidClassId(classId)) {
      sendError(res, 400, 'Invalid class selection.');
      return;
    }

    let existing;
    try {
      existing = await findCharacterByNameLower(normalized.lower);
    } catch (err) {
      handleRouteFailure(res, err, 'Character lookup error:', 'Unable to create character.');
      return;
    }
    if (existing) {
      sendError(res, 409, 'Character name already taken.');
      return;
    }

    const spawn = spawner.getSpawnPoint();
    const basePlayer = createBasePlayerState({
      world,
      spawn,
      classId,
    });
    const state = serializePlayerState(basePlayer);
    const id = generateId();
    const now = new Date();

    try {
      await createCharacter({
        id,
        accountId: account.id,
        name: normalized.name,
        nameLower: normalized.lower,
        state,
        lastSeenAt: now,
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        sendError(res, 409, 'Character name already taken.');
        return;
      }
      handleRouteFailure(res, err, 'Create character error:', 'Unable to create character.');
      return;
    }

    res.json({
      character: {
        id,
        name: normalized.name,
        classId: basePlayer.classId,
        level: basePlayer.level,
      },
    });
  });

  app.delete('/api/characters/:id', requireAuth, csrfGuard, async (/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const account = getRequiredAccount(req, res);
    if (!account) return;
    const characterId = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!characterId) {
      sendError(res, 400, 'Invalid character.');
      return;
    }

    let existing;
    try {
      existing = await findCharacterById(characterId);
    } catch (err) {
      handleRouteFailure(res, err, 'Find character error:', 'Unable to delete character.');
      return;
    }

    if (!existing || existing.accountId !== account.id) {
      sendError(res, 404, 'Character not found.');
      return;
    }

    const active = players.get(characterId);
    if (active) {
      try {
        active.ws?.close?.(4002, 'Character deleted');
      } catch {
        // ignore close errors
      }
      players.delete(characterId);
    }

    try {
      const result = await deleteCharacter(account.id, characterId);
      if (result.count === 0) {
        sendError(res, 404, 'Character not found.');
        return;
      }
    } catch (err) {
      handleRouteFailure(res, err, 'Delete character error:', 'Unable to delete character.');
      return;
    }

    res.json({ ok: true });
  });

  app.use((/** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res) => {
    const acceptsHtml = req.accepts?.('html');
    if (acceptsHtml) {
      res.status(404).send('Not Found');
      return;
    }
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((/** @type {unknown} */ err, /** @type {HttpRequestLike} */ req, /** @type {HttpResponseLike} */ res, /** @type {NextFunctionLike} */ next) => {
    if (
      typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      /** @type {{ type?: unknown }} */ (err).type === 'entity.too.large'
    ) {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    const dbResponse = typeof err === 'object' && err !== null
      ? sendDbError(res, /** @type {any} */ (err))
      : false;
    if (dbResponse) return;
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
