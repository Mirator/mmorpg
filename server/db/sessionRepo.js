// @ts-check
import { getPrismaClient } from './client.js';

export async function createSession(/** @type {any} */ { id, accountId, expiresAt, lastSeenAt }) {
  const prisma = getPrismaClient();
  return prisma.session.create({
    data: {
      id,
      accountId,
      expiresAt,
      lastSeenAt,
    },
  });
}

export async function getSessionWithAccount(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  return prisma.session.findUnique({
    where: { id },
    include: { account: true },
  });
}

export async function touchSession(/** @type {any} */ id, /** @type {any} */ lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.session.update({
    where: { id },
    data: { lastSeenAt },
  });
}

export async function deleteSession(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  return prisma.session.delete({ where: { id } });
}
