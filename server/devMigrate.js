import { spawnSync } from 'node:child_process';

function isLocalhostHost(host) {
  return host === '127.0.0.1' || host === 'localhost';
}

function isAutoMigrateEnabled(env) {
  const raw = env.AUTO_MIGRATE_DEV;
  if (raw === undefined) return true;
  const value = String(raw).toLowerCase();
  if (value === 'false' || value === '0' || value === 'no') return false;
  return true;
}

export function autoMigrateDev({ env, config, logger = console, deps = {} }) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' || nodeEnv === 'test') return;
  if (env.E2E_TEST === 'true') return;

  const host = config?.host ?? env.HOST ?? '';
  if (!isLocalhostHost(host)) return;
  if (!isAutoMigrateEnabled(env)) return;

  const dbUrl = env.DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    logger.warn?.('[dev] Skipping auto-migrate: DATABASE_URL not set.');
    return;
  }

  const run = deps.spawnSync ?? spawnSync;
  const spawnEnv = { ...process.env, ...env };
  const result = run('npx', ['prisma', 'migrate', 'dev', '--name', 'auto', '--skip-seed'], {
    stdio: 'inherit',
    env: spawnEnv,
  });

  if (result?.status && result.status !== 0) {
    logger.warn?.('[dev] Auto-migrate failed; server will still start.');
  }
}
