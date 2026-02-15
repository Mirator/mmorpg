export const MAX_LEVEL = 30;
export const MOB_MAX_LEVEL = 35;

const XP_K = 190;
const MOB_XP_A = 23;

function clampLevel(level) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
}

export function clampMobLevel(level) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MOB_MAX_LEVEL, Math.floor(level)));
}

export function xpToNext(level) {
  const lvl = clampLevel(level);
  if (lvl >= MAX_LEVEL) return 0;
  return Math.round(XP_K * lvl * lvl);
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
  const { baseXp, mult } = getMobXpBaseAndMult(mobLevel, playerLevel);
  if (baseXp === 0) return 0;
  return Math.max(0, Math.floor(baseXp * mult));
}

/**
 * Get base XP and level-diff multiplier for mob kill (for party pool calculation).
 * @param {number} mobLevel
 * @param {number} playerLevel
 * @returns {{ baseXp: number, mult: number }}
 */
export function getMobXpBaseAndMult(mobLevel, playerLevel) {
  const mob = clampLevel(mobLevel);
  const player = clampLevel(playerLevel);
  const diff = mob - player;
  if (diff <= -10) return { baseXp: 0, mult: 1 };
  const baseXp = Math.floor(MOB_XP_A * mob);
  const mult = Math.max(0.25, Math.min(1.75, 1 + 0.12 * diff));
  return { baseXp, mult };
}

/**
 * Party bonus multiplier: 1 + 0.35 * (n - 1) for n >= 1.
 * @param {number} partySize
 * @returns {number}
 */
export function partyBonus(partySize) {
  const n = Math.max(1, Math.floor(partySize ?? 1));
  return 1 + 0.35 * (n - 1);
}
