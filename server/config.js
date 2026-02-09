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
  const adminPassword = resolveAdminPassword(env);

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
