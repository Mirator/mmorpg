import { describe, expect, it } from 'vitest';
import { hashSessionToken } from './sessionToken.js';

describe('session token hashing', () => {
  it('creates stable SHA-256 hex digests', () => {
    const token = 'session-token-1';
    const first = hashSessionToken(token);
    const second = hashSessionToken(token);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different digests for different tokens', () => {
    expect(hashSessionToken('token-a')).not.toBe(hashSessionToken('token-b'));
  });
});

