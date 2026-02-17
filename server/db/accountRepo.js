// @ts-check
import { getPrismaClient } from './client.js';

export async function findAccountByUsernameLower(/** @type {any} */ usernameLower) {
  const prisma = getPrismaClient();
  return prisma.account.findUnique({ where: { usernameLower } });
}

export async function createAccount(/** @type {any} */ { id, username, usernameLower, passwordHash, passwordSalt, lastSeenAt }) {
  const prisma = getPrismaClient();
  return prisma.account.create({
    data: {
      id,
      username,
      usernameLower,
      passwordHash,
      passwordSalt,
      lastSeenAt,
    },
  });
}

export async function updateAccountLastSeen(/** @type {any} */ id, /** @type {any} */ lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.account.update({
    where: { id },
    data: { lastSeenAt },
  });
}
