import { getPrismaClient } from './client.js';

export async function createSession({ id, accountId, expiresAt, lastSeenAt }) {
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

export async function getSessionWithAccount(id) {
  const prisma = getPrismaClient();
  return prisma.session.findUnique({
    where: { id },
    include: { account: true },
  });
}

export async function touchSession(id, lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.session.update({
    where: { id },
    data: { lastSeenAt },
  });
}

export async function deleteSession(id) {
  const prisma = getPrismaClient();
  return prisma.session.delete({ where: { id } });
}
