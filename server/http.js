import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAdminStateHandler } from './admin.js';
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

export function createHttpApp({ config, world, players, resources, mobs, spawner }) {
  const app = express();
  app.disable('x-powered-by');

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: false,
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

  app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/favicon.svg');
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(ADMIN_DIR, 'index.html'));
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

  app.post('/api/auth/signup', async (req, res) => {
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

    res.json({ token, account: { id: accountId, username: normalized.name } });
  });

  app.post('/api/auth/login', async (req, res) => {
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

    res.json({ token, account: { id: account.id, username: account.username } });
  });

  async function requireAuth(req, res, next) {
    const token = getBearerToken(req);
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
      sendError(res, 401, 'Unauthorized');
      return;
    }

    const now = new Date();
    if (session.expiresAt && session.expiresAt <= now) {
      deleteSession(token).catch(() => {});
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

  return app;
}
