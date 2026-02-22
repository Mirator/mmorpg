import { describe, expect, it } from 'vitest';
import { createCsrfGuard } from './csrfGuard.js';

function createRequest(headers = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
  return {
    get(name) {
      return normalized.get(String(name).toLowerCase());
    },
  };
}

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function runGuard(guard, req) {
  const res = createResponse();
  let nextCalled = false;
  guard(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

describe('csrfGuard', () => {
  const guard = createCsrfGuard({
    allowedOrigins: new Set(['http://localhost:3000', 'http://127.0.0.1:3000']),
  });

  it('allows trusted Origin requests', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
      })
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  it('allows trusted Referer origin fallback', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        referer: 'http://127.0.0.1:3000/admin',
      })
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  it('blocks missing origin metadata', () => {
    const { nextCalled, res } = runGuard(guard, createRequest());
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('blocks untrusted origin', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        origin: 'https://evil.example',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('blocks cross-site fetch metadata', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'cross-site',
      })
    );
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('allows bearer-authenticated requests without Origin', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        authorization: 'Bearer test-token',
      })
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });

  it('allows x-admin-session header requests without Origin', () => {
    const { nextCalled, res } = runGuard(
      guard,
      createRequest({
        'x-admin-session': 'admin-token',
      })
    );
    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBeNull();
  });
});
