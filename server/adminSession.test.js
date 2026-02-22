import { describe, it, expect } from 'vitest';
import { createAdminSessionStore, timingSafeEqualText } from './adminSession.js';

function createRequest({ cookie, adminSessionHeader } = {}) {
  return {
    headers: cookie ? { cookie } : {},
    get(name) {
      const key = String(name).toLowerCase();
      if (key === 'x-admin-session') return adminSessionHeader;
      return undefined;
    },
  };
}

describe('admin session store', () => {
  it('validates passwords with timing safe compare', () => {
    expect(timingSafeEqualText('secret', 'secret')).toBe(true);
    expect(timingSafeEqualText('secret', 'different')).toBe(false);
  });

  it('issues a session for valid password and rejects invalid password', () => {
    let now = 0;
    const store = createAdminSessionStore({
      password: 'secret',
      cookieName: 'mmorpg_admin_session',
      idleTimeoutMs: 30_000,
      now: () => now,
    });

    expect(store.issueSessionFromPassword('nope')).toBeNull();
    const token = store.issueSessionFromPassword('secret');
    expect(typeof token).toBe('string');
    expect(token?.length).toBe(64);

    const req = createRequest({
      cookie: `mmorpg_admin_session=${token}`,
    });
    expect(store.hasValidSession(req)).toBe(true);
    expect(store.getSessionCount()).toBe(1);
  });

  it('expires idle sessions', () => {
    let now = 0;
    const store = createAdminSessionStore({
      password: 'secret',
      cookieName: 'mmorpg_admin_session',
      idleTimeoutMs: 1_000,
      now: () => now,
    });

    const token = store.issueSessionFromPassword('secret');
    expect(token).toBeTruthy();

    const req = createRequest({
      cookie: `mmorpg_admin_session=${token}`,
    });
    expect(store.hasValidSession(req)).toBe(true);

    now = 1_200;
    expect(store.hasValidSession(req)).toBe(false);
    expect(store.getSessionCount()).toBe(0);
  });

  it('slides session expiry on active use', () => {
    let now = 0;
    const store = createAdminSessionStore({
      password: 'secret',
      cookieName: 'mmorpg_admin_session',
      idleTimeoutMs: 1_000,
      now: () => now,
    });

    const token = store.issueSessionFromPassword('secret');
    const req = createRequest({
      cookie: `mmorpg_admin_session=${token}`,
    });

    now = 900;
    expect(store.hasValidSession(req)).toBe(true);

    now = 1_700;
    expect(store.hasValidSession(req)).toBe(true);
  });

  it('supports logout invalidation by token and request', () => {
    let now = 0;
    const store = createAdminSessionStore({
      password: 'secret',
      cookieName: 'mmorpg_admin_session',
      idleTimeoutMs: 30_000,
      now: () => now,
    });

    const token = store.issueSessionFromPassword('secret');
    expect(typeof token).toBe('string');

    const byHeaderReq = createRequest({
      adminSessionHeader: token,
    });
    expect(store.hasValidSession(byHeaderReq)).toBe(true);
    expect(store.revokeSessionFromRequest(byHeaderReq)).toBe(true);
    expect(store.hasValidSession(byHeaderReq)).toBe(false);

    const token2 = store.issueSessionFromPassword('secret');
    expect(store.revokeSessionToken(token2)).toBe(true);

    const byCookieReq = createRequest({
      cookie: `mmorpg_admin_session=${token2}`,
    });
    expect(store.hasValidSession(byCookieReq)).toBe(false);
  });
});
