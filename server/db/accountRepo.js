// @ts-check
import { getPrismaClient } from './client.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../../shared/classes.js';

function extractClassId(/** @type {any} */ state) {
  if (isValidClassId(state?.classId)) return state.classId;
  return DEFAULT_CLASS_ID;
}

function extractLevel(/** @type {any} */ state) {
  const level = Number(state?.level);
  return Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

export async function findAccountByUsernameLower(/** @type {any} */ usernameLower) {
  const prisma = getPrismaClient();
  return prisma.account.findUnique({ where: { usernameLower } });
}

export async function createAccount(/** @type {any} */ {
  id,
  username,
  usernameLower,
  passwordHash,
  passwordSalt,
  lastSignedInAt = null,
  lastSeenAt,
}) {
  const prisma = getPrismaClient();
  return prisma.account.create({
    data: {
      id,
      username,
      usernameLower,
      passwordHash,
      passwordSalt,
      lastSignedInAt,
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

export async function markAccountSignedIn(/** @type {any} */ id, /** @type {any} */ at = new Date()) {
  const prisma = getPrismaClient();
  return prisma.account.update({
    where: { id },
    data: {
      lastSignedInAt: at,
      lastSeenAt: at,
    },
  });
}

export async function listAccountsOverview(/** @type {any} */ { page = 1, pageSize = 50 } = {}) {
  const prisma = getPrismaClient();
  const safePageSize = Math.max(10, Math.min(100, Math.floor(Number(pageSize) || 50)));
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const skip = (safePage - 1) * safePageSize;

  const [totalAccounts, totalCharacters, rows] = await prisma.$transaction([
    prisma.account.count(),
    prisma.player.count(),
    prisma.account.findMany({
      orderBy: [
        { lastSignedInAt: 'desc' },
        { usernameLower: 'asc' },
      ],
      skip,
      take: safePageSize,
      select: {
        id: true,
        username: true,
        createdAt: true,
        lastSignedInAt: true,
        lastSeenAt: true,
        players: {
          orderBy: [
            { updatedAt: 'desc' },
            { nameLower: 'asc' },
          ],
          select: {
            id: true,
            name: true,
            state: true,
            lastSeenAt: true,
            updatedAt: true,
          },
        },
      },
    }),
  ]);

  return {
    page: safePage,
    pageSize: safePageSize,
    totalAccounts,
    totalCharacters,
    accounts: rows.map((row) => ({
      id: row.id,
      username: row.username,
      createdAt: row.createdAt,
      lastSignedInAt: row.lastSignedInAt,
      lastSeenAt: row.lastSeenAt,
      characters: row.players.map((/** @type {any} */ character) => ({
        id: character.id,
        name: character.name,
        classId: extractClassId(character.state),
        level: extractLevel(character.state),
        lastSeenAt: character.lastSeenAt,
        updatedAt: character.updatedAt,
      })),
    })),
  };
}
