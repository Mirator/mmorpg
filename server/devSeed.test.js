import { describe, it, expect, vi } from 'vitest';
import { seedDevAccount } from './devSeed.js';

function createLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('seedDevAccount', () => {
  it('skips in production', async () => {
    const logger = createLogger();
    const findAccountByUsernameLower = vi.fn();
    await seedDevAccount({
      env: { NODE_ENV: 'production' },
      config: { host: '127.0.0.1' },
      logger,
      deps: { findAccountByUsernameLower },
    });
    expect(findAccountByUsernameLower).not.toHaveBeenCalled();
  });

  it('skips when not localhost', async () => {
    const logger = createLogger();
    const findAccountByUsernameLower = vi.fn();
    await seedDevAccount({
      env: { NODE_ENV: 'development' },
      config: { host: '0.0.0.0' },
      logger,
      deps: { findAccountByUsernameLower },
    });
    expect(findAccountByUsernameLower).not.toHaveBeenCalled();
  });

  it('skips when db not migrated (P2021)', async () => {
    const logger = createLogger();
    const findAccountByUsernameLower = vi.fn(async () => {
      const err = new Error('missing table');
      err.code = 'P2021';
      throw err;
    });

    await seedDevAccount({
      env: { NODE_ENV: 'development' },
      config: { host: '127.0.0.1' },
      logger,
      deps: { findAccountByUsernameLower },
    });

    expect(logger.warn).toHaveBeenCalled();
  });

  it('creates account when missing', async () => {
    const logger = createLogger();
    const findAccountByUsernameLower = vi.fn(async () => null);
    const createAccount = vi.fn(async () => ({}));
    const hashPassword = vi.fn(async () => ({ hash: 'h', salt: 's' }));
    const generateId = vi.fn(() => 'id-1');

    await seedDevAccount({
      env: { NODE_ENV: 'development' },
      config: { host: 'localhost' },
      logger,
      deps: { findAccountByUsernameLower, createAccount, hashPassword, generateId },
    });

    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id-1',
        username: 'test',
        usernameLower: 'test',
        passwordHash: 'h',
        passwordSalt: 's',
      })
    );
  });
});
