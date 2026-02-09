import { describe, it, expect } from 'vitest';
import { getDbErrorResponse, sendDbError } from './httpErrors.js';

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

describe('http db error helpers', () => {
  it('maps P2021 to a migration hint', () => {
    const err = new Error('missing table');
    err.code = 'P2021';
    expect(getDbErrorResponse(err)).toEqual({
      status: 503,
      message: 'Database not migrated. Run npm run db:migrate:dev.',
    });
  });

  it('returns null for unrelated errors', () => {
    const err = new Error('unique constraint');
    err.code = 'P2002';
    expect(getDbErrorResponse(err)).toBeNull();
  });

  it('sendDbError writes the response when db is missing', () => {
    const res = createResponse();
    const err = new Error('missing table');
    err.code = 'P2021';

    expect(sendDbError(res, err)).toBe(true);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Database not migrated. Run npm run db:migrate:dev.' });
  });

  it('sendDbError returns false when no db error match', () => {
    const res = createResponse();
    const err = new Error('no match');
    err.code = 'P2002';

    expect(sendDbError(res, err)).toBe(false);
    expect(res.statusCode).toBeNull();
    expect(res.body).toBeNull();
  });
});
