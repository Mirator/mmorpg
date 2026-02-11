import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAdminStateHandler } from './admin.js';
import { createMapConfigHandlers } from './mapConfig.js';
import { sendDbError } from './httpErrors.js';
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
import { createAccount, findAccountByUsernameLower, updateAccountLastSeen } from './db/accountRepo.js';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.resolve(__dirname, '../client');
const ADMIN_DIR = path.resolve(__dirname, '../admin');
const SHARED_DIR = path.resolve(__dirname, '../shared');

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function getBearerToken(req) {
  const auth = typeof req.get === 'function' ? req.get('authorization') : '';
  if (!auth || typeof auth !== 'string') return null;
  const prefix = 'Bearer ';
  if (!auth.startsWith(prefix)) return null;
  const token = auth.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

function getCookieValue(req, name) {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : '';
  }
  return null;
}

function setSessionCookie(res, token, config) {
  res.cookie(config.sessionCookieName, token, {
    httpOnly: true,
    sameSite: config.sessionCookieSameSite,
    secure: config.sessionCookieSecure,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res, config) {
  res.clearCookie(config.sessionCookieName, {
    httpOnly: true,
    sameSite: config.sessionCookieSameSite,
    secure: config.sessionCookieSecure,
    path: '/',
  });
}

export function createHttpApp({
  config,
  world,
  players,
  resources,
  mobs,
  spawner,
  mapConfigPath,
}) {
  const app = express();
  app.disable('x-powered-by');

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
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );
  app.use(
    express.json({
      limit: config.maxPayloadBytes,
    })
  );

  const authLimiter = rateLimit({
    windowMs: 5 * 60_000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again soon.' },
    keyGenerator: (req) => {
      const ip = req.ip ?? 'unknown';
      const username =
        typeof req.body?.username === 'string'
          ? req.body.username.toLowerCase().trim()
          : '';
      return `${ip}:${username || 'unknown'}`;
    },
  });

  app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/favicon.svg');
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(ADMIN_DIR, 'index.html'));
  });
  app.get('/admin/map', (req, res) => {
    res.sendFile(path.join(ADMIN_DIR, 'map.html'));
  });
  app.use('/admin', express.static(ADMIN_DIR));
  app.use('/shared', express.static(SHARED_DIR));
  app.use(express.static(CLIENT_DIR));

  app.get(
    '/admin/state',
    createAdminStateHandler({
      password: config.adminPassword,
      world,
      players,
      resources,
      mobs,
    })
  );

  const mapHandlers = createMapConfigHandlers({
    password: config.adminPassword,
    mapConfigPath,
  });
  app.get('/admin/map-config', mapHandlers.getHandler);
  app.put('/admin/map-config', mapHandlers.putHandler);

  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    const normalized = normalizeUsername(req.body?.username);
    if (!normalized) {
      sendError(res, 400, 'Username must be 3-20 characters (letters, numbers, underscore).');
      return;
    }
    if (!isValidPassword(req.body?.password)) {
      sendError(res, 400, 'Password must be 8-64 characters.');
      return;
    }

    let existing;
    try {
      existing = await findAccountByUsernameLower(normalized.lower);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Signup lookup error:', err);
      sendError(res, 500, 'Unable to create account.');
      return;
    }
    if (existing) {
      sendError(res, 409, 'Username already taken.');
      return;
    }

    const { hash, salt } = await hashPassword(req.body.password);
    const accountId = generateId();
    const now = new Date();

    try {
      await createAccount({
        id: accountId,
        username: normalized.name,
        usernameLower: normalized.lower,
        passwordHash: hash,
        passwordSalt: salt,
        lastSeenAt: now,
      });
    } catch (err) {
      if (sendDbError(res, err)) return;
      if (err?.code === 'P2002') {
        sendError(res, 409, 'Username already taken.');
        return;
      }
      console.error('Signup error:', err);
      sendError(res, 500, 'Unable to create account.');
      return;
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    try {
      await createSession({
        id: token,
        accountId,
        expiresAt,
        lastSeenAt: now,
      });
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Session create error:', err);
      sendError(res, 500, 'Unable to create session.');
      return;
    }

    setSessionCookie(res, token, config);

    const payload = { account: { id: accountId, username: normalized.name } };
    if (config.exposeAuthToken) {
      payload.token = token;
    }
    res.json(payload);
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const normalized = normalizeUsername(req.body?.username);
    if (!normalized) {
      sendError(res, 400, 'Invalid username or password.');
      return;
    }
    if (!isValidPassword(req.body?.password ?? '')) {
      sendError(res, 400, 'Invalid username or password.');
      return;
    }

    let account;
    try {
      account = await findAccountByUsernameLower(normalized.lower);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Login lookup error:', err);
      sendError(res, 500, 'Unable to sign in.');
      return;
    }
    if (!account) {
      sendError(res, 401, 'Invalid username or password.');
      return;
    }

    const ok = await verifyPassword(req.body.password, account.passwordHash, account.passwordSalt);
    if (!ok) {
      sendError(res, 401, 'Invalid username or password.');
      return;
    }

    const token = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    try {
      await createSession({
        id: token,
        accountId: account.id,
        expiresAt,
        lastSeenAt: now,
      });
      await updateAccountLastSeen(account.id, now);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Login session error:', err);
      sendError(res, 500, 'Unable to create session.');
      return;
    }

    setSessionCookie(res, token, config);

    const payload = { account: { id: account.id, username: account.username } };
    if (config.exposeAuthToken) {
      payload.token = token;
    }
    res.json(payload);
  });

  async function requireAuth(req, res, next) {
    const token =
      getBearerToken(req) ??
      getCookieValue(req, config.sessionCookieName);
    if (!token) {
      sendError(res, 401, 'Unauthorized');
      return;
    }

    let session;
    try {
      session = await getSessionWithAccount(token);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Session lookup error:', err);
      sendError(res, 500, 'Unable to validate session.');
      return;
    }

    if (!session || !session.account) {
      clearSessionCookie(res, config);
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt <= now) {
      deleteSession(token).catch(() => {});
      clearSessionCookie(res, config);
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

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      await deleteSession(req.authToken);
    } catch (err) {
      // Ignore if already deleted.
    }
    clearSessionCookie(res, config);
    res.json({ ok: true });
  });

  app.get('/api/characters', requireAuth, async (req, res) => {
    try {
      const characters = await listCharacters(req.account.id);
      res.json({ characters });
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('List characters error:', err);
      sendError(res, 500, 'Unable to load characters.');
    }
  });

  app.post('/api/characters', requireAuth, async (req, res) => {
    const normalized = normalizeCharacterName(req.body?.name);
    if (!normalized) {
      sendError(res, 400, 'Character name must be 3-16 letters/numbers/spaces.');
      return;
    }
    if (!isValidClassId(req.body?.classId)) {
      sendError(res, 400, 'Invalid class selection.');
      return;
    }

    let existing;
    try {
      existing = await findCharacterByNameLower(normalized.lower);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Character lookup error:', err);
      sendError(res, 500, 'Unable to create character.');
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
      classId: req.body.classId,
    });
    const state = serializePlayerState(basePlayer);
    const id = generateId();
    const now = new Date();

    try {
      await createCharacter({
        id,
        accountId: req.account.id,
        name: normalized.name,
        nameLower: normalized.lower,
        state,
        lastSeenAt: now,
      });
    } catch (err) {
      if (sendDbError(res, err)) return;
      if (err?.code === 'P2002') {
        sendError(res, 409, 'Character name already taken.');
        return;
      }
      console.error('Create character error:', err);
      sendError(res, 500, 'Unable to create character.');
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

  app.delete('/api/characters/:id', requireAuth, async (req, res) => {
    const characterId = typeof req.params?.id === 'string' ? req.params.id.trim() : '';
    if (!characterId) {
      sendError(res, 400, 'Invalid character.');
      return;
    }

    let existing;
    try {
      existing = await findCharacterById(characterId);
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Find character error:', err);
      sendError(res, 500, 'Unable to delete character.');
      return;
    }

    if (!existing || existing.accountId !== req.account.id) {
      sendError(res, 404, 'Character not found.');
      return;
    }

    const active = players.get(characterId);
    if (active) {
      try {
        active.ws?.close(4002, 'Character deleted');
      } catch {
        // ignore close errors
      }
      players.delete(characterId);
    }

    try {
      const result = await deleteCharacter(req.account.id, characterId);
      if (result.count === 0) {
        sendError(res, 404, 'Character not found.');
        return;
      }
    } catch (err) {
      if (sendDbError(res, err)) return;
      console.error('Delete character error:', err);
      sendError(res, 500, 'Unable to delete character.');
      return;
    }

    res.json({ ok: true });
  });

  app.use((req, res) => {
    const acceptsHtml = req.accepts('html');
    if (acceptsHtml) {
      res.status(404).send('Not Found');
      return;
    }
    res.status(404).json({ error: 'Not Found' });
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
