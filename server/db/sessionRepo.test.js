import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashSessionToken } from '../sessionToken.js';

const store = vi.hoisted(() => ({
  createArgs: null,
  findArgs: null,
  updateArgs: null,
  deleteArgs: null,
}));

vi.mock('./client.js', () => ({
  getPrismaClient() {
    return {
      session: {
        create: async (args) => {
          store.createArgs = args;
          return args?.data ?? null;
        },
        findUnique: async (args) => {
          store.findArgs = args;
          return args?.where?.id
            ? {
                id: args.where.id,
                accountId: 'account-1',
                account: { id: 'account-1' },
              }
            : null;
        },
        update: async (args) => {
          store.updateArgs = args;
          return args;
        },
        delete: async (args) => {
          store.deleteArgs = args;
          return { id: args?.where?.id ?? null };
        },
      },
    };
  },
}));

import {
  createSession,
  deleteSession,
  getSessionWithAccount,
  touchSession,
} from './sessionRepo.js';

function resetStore() {
  store.createArgs = null;
  store.findArgs = null;
  store.updateArgs = null;
  store.deleteArgs = null;
}

describe('sessionRepo', () => {
  beforeEach(() => {
    resetStore();
  });

  it('hashes session ID on create', async () => {
    const now = new Date();
    await createSession({
      id: 'session-token',
      accountId: 'account-1',
      expiresAt: now,
      lastSeenAt: now,
    });

    expect(store.createArgs?.data?.id).toBe(hashSessionToken('session-token'));
  });

  it('hashes session ID on lookup and touch/delete', async () => {
    const token = 'session-token';
    const hashed = hashSessionToken(token);
    await getSessionWithAccount(token);
    await touchSession(token, new Date());
    await deleteSession(token);

    expect(store.findArgs?.where?.id).toBe(hashed);
    expect(store.updateArgs?.where?.id).toBe(hashed);
    expect(store.deleteArgs?.where?.id).toBe(hashed);
  });
});

