import { resolveAdminPassword } from './admin.js';
import { MOB_CONFIG, RESOURCE_CONFIG, PLAYER_CONFIG, getConfigSnapshot } from '../shared/config.js';

const DEFAULT_PORT = 3000;

function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(value) {
  return value === 'true';
}

function parseSameSiteEnv(value, fallback = 'lax') {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'lax' || raw === 'strict' || raw === 'none') {
    return raw;
  }
  return fallback;
}

function isLocalhostHost(host) {
  return host === '127.0.0.1' || host === 'localhost';
}

function parseAllowedOrigins(raw, defaults) {
  if (!raw) return new Set(defaults);
  const parts = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length > 0 ? new Set(parts) : new Set(defaults);
}

export function getServerConfig(env = process.env) {
  const port = parseIntEnv(env.PORT, DEFAULT_PORT) || DEFAULT_PORT;
  const host = env.HOST ?? '127.0.0.1';
  const trustProxy = parseBoolEnv(env.TRUST_PROXY);

  const maxConnectionsPerIp = parseIntEnv(env.MAX_CONNECTIONS_PER_IP, 5);
  const maxPayloadBytes = parseIntEnv(env.MAX_PAYLOAD_BYTES, 16 * 1024);
  const msgRateMax = parseIntEnv(env.MSG_RATE_MAX, 60);
  const msgRateIntervalMs = parseIntEnv(env.MSG_RATE_INTERVAL_MS, 1000);
  const heartbeatIntervalMs = parseIntEnv(env.HEARTBEAT_INTERVAL_MS, 30_000);
  const persistIntervalMs = parseIntEnv(env.PERSIST_INTERVAL_MS, 5000);
  const persistForceMs = parseIntEnv(env.PERSIST_FORCE_MS, 30_000);
  const persistPosEps = Number.isFinite(Number(env.PERSIST_POS_EPS))
    ? Number(env.PERSIST_POS_EPS)
    : 0.6;

  const allowNoOrigin = parseBoolEnv(env.ALLOW_NO_ORIGIN);
  const allowNoOriginRemote = parseBoolEnv(env.ALLOW_NO_ORIGIN_REMOTE);
  const adminPassword = resolveAdminPassword(env);

  const sessionCookieName = env.SESSION_COOKIE_NAME ?? 'mmorpg_session';
  const sessionCookieSameSite = parseSameSiteEnv(env.SESSION_COOKIE_SAMESITE, 'lax');
  const sessionCookieSecure = env.SESSION_COOKIE_SECURE === undefined
    ? env.NODE_ENV === 'production'
    : parseBoolEnv(env.SESSION_COOKIE_SECURE);
  const exposeAuthToken = parseBoolEnv(env.EXPOSE_AUTH_TOKEN);

  const defaultOrigins = new Set([
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
  ]);

  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS, defaultOrigins);

  return {
    port,
    host,
    trustProxy,
    allowNoOrigin,
    allowNoOriginRemote,
    allowedOrigins,
    maxConnectionsPerIp,
    maxPayloadBytes,
    msgRateMax,
    msgRateIntervalMs,
    heartbeatIntervalMs,
    persistIntervalMs,
    persistForceMs,
    persistPosEps,
    adminPassword,
    isLocalhost: isLocalhostHost(host),
    sessionCookieName,
    sessionCookieSameSite,
    sessionCookieSecure,
    exposeAuthToken,
    tickHz: 60,
    broadcastHz: 20,
    playerRadius: 0.6,
    respawnMs: 5000,
    resource: {
      harvestRadius: RESOURCE_CONFIG.harvestRadius,
      respawnMs: RESOURCE_CONFIG.respawnMs,
    },
    mob: {
      respawnMs: MOB_CONFIG.respawnMs,
      attackDamageBase: MOB_CONFIG.attackDamageBase,
      attackDamagePerLevel: MOB_CONFIG.attackDamagePerLevel,
      radius: MOB_CONFIG.radius,
    },
    player: {
      maxHp: PLAYER_CONFIG.maxHp,
      speed: PLAYER_CONFIG.speed,
      invSlots: PLAYER_CONFIG.invSlots,
      invStackMax: PLAYER_CONFIG.invStackMax,
    },
    configSnapshot: getConfigSnapshot(),
  };
}
