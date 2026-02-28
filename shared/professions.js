// @ts-check

export const PROFESSION_TRACKS = [
  'gathering',
  'smithing',
  'alchemy',
  'woodcraft',
];

export const MAX_PROFESSION_LEVEL = 10;
export const MAX_ACTIVE_CONTRACTS = 3;
export const CONTRACT_ROTATION_MS = 10 * 60 * 1000;
export const STATION_INTERACT_RADIUS = 4.5;

export const STATION_TYPE_BY_STRUCTURE_KIND = Object.freeze({
  barracks: 'forge',
  market: 'alchemy_table',
  storage: 'workbench',
});

const PROFESSION_TRACK_SET = new Set(PROFESSION_TRACKS);

function clampTrackLevel(/** @type {any} */ level) {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(MAX_PROFESSION_LEVEL, Math.floor(level)));
}

function clampTrackXp(/** @type {any} */ xp) {
  if (!Number.isFinite(xp)) return 0;
  return Math.max(0, Math.floor(xp));
}

function normalizeTrackState(/** @type {any} */ raw) {
  const level = clampTrackLevel(raw?.level);
  const xp = clampTrackXp(raw?.xp);
  const maxXp = professionXpToNext(level);
  return {
    level,
    xp: maxXp > 0 ? Math.min(xp, maxXp) : 0,
  };
}

export function isValidProfessionTrack(/** @type {any} */ track) {
  return typeof track === 'string' && PROFESSION_TRACK_SET.has(track);
}

export function createProfessionMasteries(/** @type {any} */ raw = {}) {
  const /** @type {Record<string, { level: number, xp: number }>} */ out = {};
  for (const track of PROFESSION_TRACKS) {
    out[track] = normalizeTrackState(raw?.[track]);
  }
  return out;
}

export function professionXpToNext(/** @type {any} */ level) {
  const safeLevel = clampTrackLevel(level);
  if (safeLevel >= MAX_PROFESSION_LEVEL) return 0;
  return 100 + (safeLevel - 1) * 50;
}

export function getProfessionLevel(/** @type {any} */ masteries, /** @type {any} */ track) {
  if (!isValidProfessionTrack(track)) return 1;
  return createProfessionMasteries(masteries)[track].level;
}

export function addProfessionXp(/** @type {any} */ masteries, /** @type {any} */ track, /** @type {any} */ amount) {
  const next = createProfessionMasteries(masteries);
  if (!isValidProfessionTrack(track)) {
    return { masteries: next, leveledUp: false, oldLevel: 1, newLevel: 1 };
  }

  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const state = next[track];
  const oldLevel = state.level;
  let level = state.level;
  let xp = state.xp + safeAmount;

  while (level < MAX_PROFESSION_LEVEL) {
    const needed = professionXpToNext(level);
    if (!needed || xp < needed) break;
    xp -= needed;
    level += 1;
  }

  if (level >= MAX_PROFESSION_LEVEL) {
    level = MAX_PROFESSION_LEVEL;
    xp = 0;
  }

  next[track] = {
    level,
    xp,
  };

  return {
    masteries: next,
    leveledUp: level > oldLevel,
    oldLevel,
    newLevel: level,
  };
}

export function getStationTypeForStructureKind(/** @type {any} */ kind) {
  if (typeof kind !== 'string') return null;
  return /** @type {Record<string, any>} */ (STATION_TYPE_BY_STRUCTURE_KIND)[kind] ?? null;
}

export function getStationKindsForType(/** @type {any} */ stationType) {
  if (typeof stationType !== 'string' || stationType.length === 0) return [];
  return Object.entries(STATION_TYPE_BY_STRUCTURE_KIND)
    .filter(([, value]) => value === stationType)
    .map(([key]) => key);
}

export function getRepairDiscountMultiplier(/** @type {any} */ masteries, /** @type {any} */ track) {
  const level = getProfessionLevel(masteries, track);
  let discount = 0;
  if (level >= 3) discount += 0.1;
  if (level >= 6) discount += 0.1;
  if (level >= 9) discount += 0.1;
  return Math.max(0.1, 1 - discount);
}

export function getSalvageYieldMultiplier(/** @type {any} */ masteries, /** @type {any} */ track) {
  const level = getProfessionLevel(masteries, track);
  let yieldMultiplier = 0.3;
  if (level >= 4) yieldMultiplier += 0.1;
  if (level >= 8) yieldMultiplier += 0.1;
  return Math.min(0.5, yieldMultiplier);
}

export function getContractRotationBucket(/** @type {any} */ now = Date.now()) {
  const safeNow = Number.isFinite(now) ? now : Date.now();
  return Math.floor(safeNow / CONTRACT_ROTATION_MS);
}
