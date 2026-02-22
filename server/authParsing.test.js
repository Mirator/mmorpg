import { describe, expect, it } from 'vitest';
import { getCookieValue, normalizeId } from './authParsing.js';

describe('authParsing', () => {
  it('normalizes IDs with pattern and length checks', () => {
    expect(normalizeId('abc-123')).toBe('abc-123');
    expect(normalizeId('')).toBeNull();
    expect(normalizeId('bad value')).toBeNull();
    expect(normalizeId('x'.repeat(65))).toBeNull();
  });

  it('returns null for malformed cookie encoding instead of throwing', () => {
    const req = {
      headers: {
        cookie: 'mmorpg_session=%E0%A4%A',
      },
    };
    expect(getCookieValue(req, 'mmorpg_session')).toBeNull();
  });

  it('decodes valid cookie values', () => {
    const req = {
      headers: {
        cookie: 'a=1; mmorpg_session=token%2Bvalue',
      },
    };
    expect(getCookieValue(req, 'mmorpg_session')).toBe('token+value');
  });
});

