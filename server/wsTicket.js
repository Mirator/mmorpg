// @ts-check
import crypto from 'node:crypto';

export const TICKET_TTL_MS = 60_000; // 60 seconds
const TICKET_CLEANUP_INTERVAL_MS = 30_000;
export const MAX_TICKETS_PER_ACCOUNT = 20;
export const MAX_TICKETS_TOTAL = 20_000;

/** @type {Map<string, number>} */
const ticketCountsByAccountId = new Map();
const tickets = new Map();

function generateTicketId() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * @param {string} accountId
 */
function incrementAccountTicketCount(accountId) {
  ticketCountsByAccountId.set(accountId, (ticketCountsByAccountId.get(accountId) ?? 0) + 1);
}

/**
 * @param {string} accountId
 */
function decrementAccountTicketCount(accountId) {
  const next = (ticketCountsByAccountId.get(accountId) ?? 1) - 1;
  if (next <= 0) {
    ticketCountsByAccountId.delete(accountId);
  } else {
    ticketCountsByAccountId.set(accountId, next);
  }
}

/**
 * @param {string} ticketId
 */
function removeTicket(ticketId) {
  const entry = tickets.get(ticketId);
  if (!entry) return null;
  tickets.delete(ticketId);
  decrementAccountTicketCount(entry.accountId);
  return entry;
}

/**
 * @param {number} [now]
 */
function evictExpiredTickets(now = Date.now()) {
  for (const [ticketId, entry] of tickets) {
    if (now > entry.expiresAt) {
      removeTicket(ticketId);
    }
  }
}

export function createTicket(/** @type {any} */ { accountId, characterId }) {
  if (typeof accountId !== 'string' || typeof characterId !== 'string') return null;
  if (!accountId || !characterId) return null;
  evictExpiredTickets();
  if ((ticketCountsByAccountId.get(accountId) ?? 0) >= MAX_TICKETS_PER_ACCOUNT) {
    return null;
  }
  if (tickets.size >= MAX_TICKETS_TOTAL) {
    return null;
  }

  const id = generateTicketId();
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(id, { accountId, characterId, expiresAt });
  incrementAccountTicketCount(accountId);
  return id;
}

export function validateAndConsumeTicket(/** @type {any} */ ticketId) {
  if (!ticketId || typeof ticketId !== 'string') return null;
  const entry = removeTicket(ticketId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return { accountId: entry.accountId, characterId: entry.characterId };
}

const cleanupId = setInterval(() => {
  evictExpiredTickets();
}, TICKET_CLEANUP_INTERVAL_MS);
cleanupId.unref?.();

export function __resetWsTicketsForTests() {
  tickets.clear();
  ticketCountsByAccountId.clear();
}
