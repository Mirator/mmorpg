import { describe, it, expect, vi } from 'vitest';
import { autoMigrateDev } from './devMigrate.js';

function createLogger() {
  return {
    warn: vi.fn(),
  };
}

describe('autoMigrateDev', () => {
  it('skips in production', () => {
    const spawnSync = vi.fn();
    autoMigrateDev({
      env: { NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost' },
      config: { host: '127.0.0.1' },
      deps: { spawnSync },
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('skips when not localhost', () => {
    const spawnSync = vi.fn();
    autoMigrateDev({
      env: { NODE_ENV: 'development', DATABASE_URL: 'postgres://localhost' },
      config: { host: '0.0.0.0' },
      deps: { spawnSync },
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('skips when disabled via env', () => {
    const spawnSync = vi.fn();
    autoMigrateDev({
      env: { NODE_ENV: 'development', HOST: '127.0.0.1', AUTO_MIGRATE_DEV: 'false' },
      config: { host: '127.0.0.1' },
      deps: { spawnSync },
    });
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('warns and skips when DATABASE_URL missing', () => {
    const spawnSync = vi.fn();
    const logger = createLogger();
    autoMigrateDev({
      env: { NODE_ENV: 'development', HOST: '127.0.0.1', DATABASE_URL: '' },
      config: { host: '127.0.0.1' },
      logger,
      deps: { spawnSync },
    });
    expect(spawnSync).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('runs prisma migrate dev in local development', () => {
    const spawnSync = vi.fn(() => ({ status: 0 }));
    autoMigrateDev({
      env: { NODE_ENV: 'development', HOST: '127.0.0.1', DATABASE_URL: 'postgres://localhost' },
      config: { host: '127.0.0.1' },
      deps: { spawnSync },
    });
    expect(spawnSync).toHaveBeenCalledWith(
      'npx',
      ['prisma', 'migrate', 'dev', '--name', 'auto', '--skip-seed'],
      expect.objectContaining({ stdio: 'inherit', env: expect.any(Object) })
    );
  });
});
