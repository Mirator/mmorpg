export const MAX_LEVEL = 20;

const LEVEL_1_XP = 100;
const CURVE_EARLY = 1.2;
const CURVE_MID = 1.35;
const CURVE_LATE = 1.6;

function clampLevel(level) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
}

export function xpToNext(level) {
  const lvl = clampLevel(level);
  if (lvl >= MAX_LEVEL) return 0;

  const xpAt5 = Math.round(LEVEL_1_XP * CURVE_EARLY ** (5 - 1));
  const xpAt10 = Math.round(xpAt5 * CURVE_MID ** (10 - 5));

  if (lvl <= 5) {
    return Math.round(LEVEL_1_XP * CURVE_EARLY ** (lvl - 1));
  }
  if (lvl <= 10) {
    return Math.round(xpAt5 * CURVE_MID ** (lvl - 5));
  }
  return Math.round(xpAt10 * CURVE_LATE ** (lvl - 10));
}

export function totalXpForLevel(level, xp = 0) {
  const lvl = clampLevel(level);
  let total = 0;
  for (let i = 1; i < lvl; i += 1) {
    total += xpToNext(i);
  }
  return total + Math.max(0, Math.floor(xp ?? 0));
}

export function addXp({ level, xp }, amount) {
  let nextLevel = clampLevel(level);
  let nextXp = Math.max(0, Math.floor(xp ?? 0)) + Math.max(0, Math.floor(amount ?? 0));

  while (nextLevel < MAX_LEVEL) {
    const needed = xpToNext(nextLevel);
    if (!needed || nextXp < needed) break;
    nextXp -= needed;
    nextLevel += 1;
  }

  if (nextLevel >= MAX_LEVEL) {
    nextLevel = MAX_LEVEL;
    nextXp = Math.min(nextXp, xpToNext(MAX_LEVEL));
  }

  return { level: nextLevel, xp: nextXp };
}

export function calculateMobXp(mobLevel, playerLevel) {
  const mob = clampLevel(mobLevel);
  const player = clampLevel(playerLevel);
  const diff = mob - player;
  if (Math.abs(diff) > 5) return 0;
  const base = 20 * mob;
  const multiplier = Math.max(0.1, 1 + diff * 0.2);
  return Math.max(0, Math.floor(base * multiplier + 1e-6));
}
