// @ts-check
import { getPrismaClient } from './client.js';
import { PLAYER_STATE_VERSION } from './playerState.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../../shared/classes.js';

export async function loadPlayer(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  return prisma.player.findUnique({ where: { id } });
}

function extractClassId(/** @type {any} */ state) {
  if (isValidClassId(state?.classId)) return state.classId;
  return DEFAULT_CLASS_ID;
}

function extractLevel(/** @type {any} */ state) {
  const level = Number(state?.level);
  return Number.isFinite(level) && level >= 1 ? Math.floor(level) : 1;
}

export async function findCharacterByNameLower(/** @type {any} */ nameLower) {
  const prisma = getPrismaClient();
  return prisma.player.findUnique({ where: { nameLower } });
}

export async function findCharacterById(/** @type {any} */ id) {
  const prisma = getPrismaClient();
  return prisma.player.findUnique({ where: { id } });
}

export async function listCharacters(/** @type {any} */ accountId) {
  const prisma = getPrismaClient();
  const rows = await prisma.player.findMany({
    where: { accountId },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((/** @type {any} */ row) => ({
    id: row.id,
    name: row.name,
    classId: extractClassId(row.state),
    level: extractLevel(row.state),
    updatedAt: row.updatedAt,
  }));
}

export async function createCharacter(/** @type {any} */ { id, accountId, name, nameLower, state, lastSeenAt }) {
  const prisma = getPrismaClient();
  return prisma.player.create({
    data: {
      id,
      accountId,
      name,
      nameLower,
      state,
      stateVersion: PLAYER_STATE_VERSION,
      lastSeenAt,
    },
  });
}

export async function deleteCharacter(/** @type {any} */ accountId, /** @type {any} */ id) {
  const prisma = getPrismaClient();
  return prisma.player.deleteMany({ where: { id, accountId } });
}

export async function savePlayer(/** @type {any} */ player, /** @type {any} */ state, /** @type {any} */ lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  const id = player?.persistId ?? player?.id;
  if (!id) {
    throw new Error('Missing player id for persistence.');
  }
  const name = player?.name ?? player?.persistName;
  const nameLower = player?.nameLower ?? player?.persistNameLower;
  const accountId = player?.accountId ?? player?.persistAccountId;

  if (!name || !nameLower || !accountId) {
    return prisma.player.update({
      where: { id },
      data: {
        state,
        stateVersion: PLAYER_STATE_VERSION,
        lastSeenAt,
      },
    });
  }

  return prisma.player.upsert({
    where: { id },
    create: {
      id,
      accountId,
      name,
      nameLower,
      state,
      stateVersion: PLAYER_STATE_VERSION,
      lastSeenAt,
    },
    update: {
      state,
      stateVersion: PLAYER_STATE_VERSION,
      lastSeenAt,
    },
  });
}
