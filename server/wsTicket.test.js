import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetWsTicketsForTests,
  createTicket,
  MAX_TICKETS_PER_ACCOUNT,
  TICKET_TTL_MS,
  validateAndConsumeTicket,
} from './wsTicket.js';

describe('wsTicket', () => {
  beforeEach(() => {
    vi.useRealTimers();
    __resetWsTicketsForTests();
  });

  it('creates one-time tickets and rejects replay', () => {
    const ticket = createTicket({ accountId: 'account-1', characterId: 'character-1' });
    expect(typeof ticket).toBe('string');
    expect(ticket).toBeTruthy();

    const firstUse = validateAndConsumeTicket(ticket);
    expect(firstUse).toEqual({
      accountId: 'account-1',
      characterId: 'character-1',
    });

    const replay = validateAndConsumeTicket(ticket);
    expect(replay).toBeNull();
  });

  it('enforces per-account outstanding ticket cap', () => {
    /** @type {string[]} */
    const issued = [];
    for (let i = 0; i < MAX_TICKETS_PER_ACCOUNT; i += 1) {
      const ticket = createTicket({
        accountId: 'account-1',
        characterId: `character-${i + 1}`,
      });
      expect(typeof ticket).toBe('string');
      issued.push(ticket);
    }

    const capped = createTicket({
      accountId: 'account-1',
      characterId: 'character-over-cap',
    });
    expect(capped).toBeNull();

    const released = validateAndConsumeTicket(issued[0]);
    expect(released).not.toBeNull();

    const afterRelease = createTicket({
      accountId: 'account-1',
      characterId: 'character-after-release',
    });
    expect(typeof afterRelease).toBe('string');
  });

  it('evicts expired tickets before issuing new ones', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-24T12:00:00.000Z'));

    for (let i = 0; i < MAX_TICKETS_PER_ACCOUNT; i += 1) {
      const ticket = createTicket({
        accountId: 'account-1',
        characterId: `character-${i + 1}`,
      });
      expect(typeof ticket).toBe('string');
    }

    vi.setSystemTime(Date.now() + TICKET_TTL_MS + 1);
    const ticketAfterTtl = createTicket({
      accountId: 'account-1',
      characterId: 'character-fresh',
    });
    expect(typeof ticketAfterTtl).toBe('string');

    const consumed = validateAndConsumeTicket(ticketAfterTtl);
    expect(consumed).toEqual({
      accountId: 'account-1',
      characterId: 'character-fresh',
    });
  });
});
