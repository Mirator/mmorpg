import crypto from 'node:crypto';

const TICKET_TTL_MS = 60_000; // 60 seconds
const tickets = new Map();

function generateTicketId() {
  return crypto.randomBytes(24).toString('base64url');
}

export function createTicket({ accountId, characterId }) {
  const id = generateTicketId();
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(id, { accountId, characterId, expiresAt });
  return id;
}

export function validateAndConsumeTicket(ticketId) {
  if (!ticketId || typeof ticketId !== 'string') return null;
  const entry = tickets.get(ticketId);
  tickets.delete(ticketId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return { accountId: entry.accountId, characterId: entry.characterId };
}
