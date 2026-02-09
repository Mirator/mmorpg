import { getPrismaClient } from './client.js';

export async function findAccountByUsernameLower(usernameLower) {
  const prisma = getPrismaClient();
  return prisma.account.findUnique({ where: { usernameLower } });
}

export async function createAccount({ id, username, usernameLower, passwordHash, passwordSalt, lastSeenAt }) {
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

export async function updateAccountLastSeen(id, lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.account.update({
    where: { id },
    data: { lastSeenAt },
  });
}
