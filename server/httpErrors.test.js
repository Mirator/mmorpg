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

  it('maps P2002 to conflict response', () => {
    const err = new Error('unique constraint');
    err.code = 'P2002';
    expect(getDbErrorResponse(err)).toEqual({
      status: 409,
      message: 'A record with this value already exists.',
    });
  });

  it('maps P2003 to conflict response', () => {
    const err = new Error('foreign key failed');
    err.code = 'P2003';
    expect(getDbErrorResponse(err)).toEqual({
      status: 409,
      message: 'Referenced record does not exist.',
    });
  });

  it('maps P2025 to not found response', () => {
    const err = new Error('record not found');
    err.code = 'P2025';
    expect(getDbErrorResponse(err)).toEqual({
      status: 404,
      message: 'Record not found.',
    });
  });

  it('returns null for unknown error codes', () => {
    const err = new Error('unknown');
    err.code = 'P9999';
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
    err.code = 'P9999';

    expect(sendDbError(res, err)).toBe(false);
    expect(res.statusCode).toBeNull();
    expect(res.body).toBeNull();
  });
});
