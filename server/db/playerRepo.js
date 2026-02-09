import { getPrismaClient } from './client.js';
import { PLAYER_STATE_VERSION } from './playerState.js';

export async function loadPlayer(id) {
  const prisma = getPrismaClient();
  return prisma.player.findUnique({ where: { id } });
}

export async function createPlayer(id, state, lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.player.create({
    data: {
      id,
      state,
      stateVersion: PLAYER_STATE_VERSION,
      lastSeenAt,
    },
  });
}

export async function savePlayer(id, state, lastSeenAt = new Date()) {
  const prisma = getPrismaClient();
  return prisma.player.upsert({
    where: { id },
    create: {
      id,
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
