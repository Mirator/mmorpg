import { describe, expect, it } from 'vitest';
import { getServerConfig } from './config.js';

describe('server config security defaults', () => {
  it('requires ADMIN_PASSWORD even on localhost', () => {
    expect(() =>
      getServerConfig({
        HOST: '127.0.0.1',
        PORT: '3000',
      })
    ).toThrow(/ADMIN_PASSWORD is required/);
  });

  it('requires ADMIN_PASSWORD on non-localhost hosts', () => {
    expect(() =>
      getServerConfig({
        HOST: '0.0.0.0',
        PORT: '3000',
      })
    ).toThrow(/ADMIN_PASSWORD is required/);
  });

  it('uses explicit ADMIN_PASSWORD without localhost fallback', () => {
    const config = getServerConfig({
      HOST: '127.0.0.1',
      PORT: '3000',
      ADMIN_PASSWORD: 'strong-password',
    });
    expect(config.adminPassword).toBe('strong-password');
  });
});

