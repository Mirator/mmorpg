// @ts-check
import { getPrismaClient } from './client.js';
import { hashSessionToken } from '../sessionToken.js';

export async function createSession(/** @type {any} */ { id, accountId, expiresAt, lastSeenAt }) {
  const prisma = getPrismaClient();
  const hashedId = hashSessionToken(id);
  return prisma.session.create({
    data: {
      id: hashedId,
      accountId,
      expiresAt,
      lastSeenAt,
    },
  });
}

export async function getSessionWithAccount(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  const hashedId = hashSessionToken(id);
  return prisma.session.findUnique({
    where: { id: hashedId },
    include: { account: true },
  });
}

export async function touchSession(/** @type {any} */ id, /** @type {any} */ lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  const hashedId = hashSessionToken(id);
  return prisma.session.update({
    where: { id: hashedId },
    data: { lastSeenAt },
  });
}

export async function deleteSession(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  const hashedId = hashSessionToken(id);
  return prisma.session.delete({ where: { id: hashedId } });
}
