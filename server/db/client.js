// @ts-check
import { PrismaClient } from '@prisma/client';

/** @type {PrismaClient | null} */
let prisma = null;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

export async function disconnectPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}
