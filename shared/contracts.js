// @ts-check

import {
  CONTRACT_ROTATION_MS,
  MAX_ACTIVE_CONTRACTS,
  getContractRotationBucket,
  isValidProfessionTrack,
} from './professions.js';

export { CONTRACT_ROTATION_MS, MAX_ACTIVE_CONTRACTS } from './professions.js';

export const DAILY_COMMISSION_RESET_MS = 20 * 60 * 60 * 1000;
export const CONTRACT_BONUS_DAILY = 'daily_commission';

export const KNOWN_CONTRACT_VENDOR_IDS = [
  'vendor_c_01',
  'vendor_c_02',
  'vendor_c_03',
  'vendor_sw_01',
];

/** @type {Array<{
 *   id: string,
 *   title: string,
 *   kind: 'hunt' | 'gather' | 'craft' | 'delivery',
 *   vendorPools: string[],
 *   levelMin: number,
 *   levelMax: number,
 *   target?: string,
 *   requiredCount: number,
 *   deliveryItemKind?: string,
 *   deliveryItemCount?: number,
 *   rewardXp: number,
 *   rewardCopper: number,
 *   rewardMastery?: Array<{ track: string, xp: number }>,
 * }>} */
export const CONTRACT_TEMPLATES = [
  {
    id: 'gather_herbs_for_tonics',
    title: 'Gather Healing Herbs',
    kind: 'gather',
    vendorPools: ['starter', 'general'],
    levelMin: 1,
    levelMax: 8,
    target: 'herb',
    requiredCount: 4,
    rewardXp: 90,
    rewardCopper: 35,
    rewardMastery: [{ track: 'gathering', xp: 25 }],
  },
  {
    id: 'gather_ore_for_smith',
    title: 'Gather Iron Ore',
    kind: 'gather',
    vendorPools: ['starter', 'general'],
    levelMin: 1,
    levelMax: 10,
    target: 'ore',
    requiredCount: 3,
    rewardXp: 100,
    rewardCopper: 40,
    rewardMastery: [
      { track: 'gathering', xp: 20 },
      { track: 'smithing', xp: 15 },
    ],
  },
  {
    id: 'hunt_wolves_near_hearth',
    title: 'Cull the Wolves',
    kind: 'hunt',
    vendorPools: ['starter', 'general'],
    levelMin: 1,
    levelMax: 12,
    target: 'wolf',
    requiredCount: 3,
    rewardXp: 110,
    rewardCopper: 45,
    rewardMastery: [{ track: 'gathering', xp: 10 }],
  },
  {
    id: 'brew_minor_restores',
    title: 'Brew Minor Restores',
    kind: 'craft',
    vendorPools: ['starter', 'general'],
    levelMin: 1,
    levelMax: 12,
    target: 'herb_health_potion',
    requiredCount: 2,
    rewardXp: 120,
    rewardCopper: 50,
    rewardMastery: [{ track: 'alchemy', xp: 30 }],
  },
  {
    id: 'deliver_crystals_to_vendor',
    title: 'Crystal Delivery',
    kind: 'delivery',
    vendorPools: ['starter', 'general'],
    levelMin: 1,
    levelMax: 15,
    requiredCount: 1,
    deliveryItemKind: 'crystal',
    deliveryItemCount: 3,
    rewardXp: 130,
    rewardCopper: 65,
    rewardMastery: [{ track: 'gathering', xp: 20 }],
  },
  {
    id: 'hunt_tribal_raiders',
    title: 'Break the Raider Pack',
    kind: 'hunt',
    vendorPools: ['outpost', 'general'],
    levelMin: 4,
    levelMax: 18,
    target: 'tribal',
    requiredCount: 4,
    rewardXp: 170,
    rewardCopper: 80,
    rewardMastery: [{ track: 'smithing', xp: 20 }],
  },
  {
    id: 'shape_hardwood_bow',
    title: 'Craft Reinforced Bow',
    kind: 'craft',
    vendorPools: ['outpost', 'general'],
    levelMin: 4,
    levelMax: 20,
    target: 'woodcraft_reinforced_bow',
    requiredCount: 1,
    rewardXp: 180,
    rewardCopper: 90,
    rewardMastery: [{ track: 'woodcraft', xp: 35 }],
  },
  {
    id: 'deliver_wood_to_outpost',
    title: 'Supply the Outpost',
    kind: 'delivery',
    vendorPools: ['outpost', 'general'],
    levelMin: 4,
    levelMax: 20,
    requiredCount: 1,
    deliveryItemKind: 'wood',
    deliveryItemCount: 6,
    rewardXp: 160,
    rewardCopper: 85,
    rewardMastery: [{ track: 'woodcraft', xp: 20 }],
  },
];

const CONTRACT_TEMPLATE_BY_ID = new Map(
  CONTRACT_TEMPLATES.map((template) => [template.id, template])
);

function hashString(/** @type {string} */ value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function clampProgress(/** @type {any} */ value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeRewardMastery(/** @type {any} */ raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => isValidProfessionTrack(entry?.track))
    .map((entry) => ({
      track: entry.track,
      xp: Math.max(0, Math.floor(Number(entry.xp) || 0)),
    }))
    .filter((entry) => entry.xp > 0);
}

export function createActiveContracts(/** @type {any} */ raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({
      templateId: typeof entry?.templateId === 'string' ? entry.templateId : '',
      vendorId: typeof entry?.vendorId === 'string' ? entry.vendorId : '',
      acceptedAt: Number.isFinite(entry?.acceptedAt) ? entry.acceptedAt : 0,
      progress: clampProgress(entry?.progress),
      completed: !!entry?.completed,
      delivered: !!entry?.delivered,
      ...(entry?.bonusType === CONTRACT_BONUS_DAILY ? { bonusType: CONTRACT_BONUS_DAILY } : {}),
      ...(Number.isFinite(entry?.resetAt) ? { resetAt: Math.max(0, Math.floor(entry.resetAt)) } : {}),
    }))
    .filter((entry) => CONTRACT_TEMPLATE_BY_ID.has(entry.templateId));
}

export function getContractTemplateById(/** @type {any} */ id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return CONTRACT_TEMPLATE_BY_ID.get(id) ?? null;
}

export function getVendorContractPoolKey(/** @type {any} */ vendorId) {
  if (typeof vendorId !== 'string') return 'general';
  if (vendorId.startsWith('vendor_sw_')) return 'outpost';
  return 'starter';
}

function pickRotatingTemplates(/** @type {any} */ templates, /** @type {any} */ maxCount, /** @type {any} */ bucket) {
  if (!Array.isArray(templates) || templates.length === 0) return [];
  const count = Math.min(Math.max(1, Math.floor(maxCount) || 1), templates.length);
  const start = Math.abs(Math.floor(bucket) || 0) % templates.length;
  const /** @type {any[]} */ picked = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(templates[(start + i) % templates.length]);
  }
  return picked;
}

export function buildContractOffer(/** @type {any} */ template, /** @type {any} */ options = {}) {
  return {
    id: template.id,
    title: template.title,
    kind: template.kind,
    target: template.target ?? null,
    requiredCount: template.requiredCount,
    deliveryItemKind: template.deliveryItemKind ?? null,
    deliveryItemCount: template.deliveryItemCount ?? null,
    rewardXp: template.rewardXp,
    rewardCopper: template.rewardCopper,
    rewardMastery: normalizeRewardMastery(template.rewardMastery),
    ...(options?.bonusType === CONTRACT_BONUS_DAILY ? { bonusType: CONTRACT_BONUS_DAILY } : {}),
    ...(Number.isFinite(options?.resetAt) ? { resetAt: Math.max(0, Math.floor(options.resetAt)) } : {}),
  };
}

export function getContractOffersForVendor(/** @type {any} */ vendorId, /** @type {any} */ playerLevel = 1, /** @type {any} */ now = Date.now()) {
  const poolKey = getVendorContractPoolKey(vendorId);
  const safeLevel = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const matching = CONTRACT_TEMPLATES.filter((template) =>
    template.vendorPools.includes(poolKey) &&
    safeLevel >= template.levelMin &&
    safeLevel <= template.levelMax
  );
  const fallback = matching.length > 0
    ? matching
    : CONTRACT_TEMPLATES.filter((template) => template.vendorPools.includes(poolKey));
  const picked = pickRotatingTemplates(fallback, 3, getContractRotationBucket(now));
  return picked.map((template) => buildContractOffer(template));
}

export function getOffersByVendor(/** @type {any} */ playerLevel = 1, /** @type {any} */ now = Date.now()) {
  const /** @type {Record<string, ReturnType<typeof getContractOffersForVendor>>} */ offersByVendor = {};
  for (const vendorId of KNOWN_CONTRACT_VENDOR_IDS) {
    offersByVendor[vendorId] = getContractOffersForVendor(vendorId, playerLevel, now);
  }
  return offersByVendor;
}

export function getDailyCommissionWindowStart(/** @type {any} */ now = Date.now()) {
  const safeNow = Number.isFinite(now) ? Math.max(0, Math.floor(now)) : Date.now();
  return Math.floor(safeNow / DAILY_COMMISSION_RESET_MS) * DAILY_COMMISSION_RESET_MS;
}

function hasClaimedDailyCommission(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
  const claimedAt = Number.isFinite(player?.dailyCommissionClaimedAt)
    ? Math.max(0, Math.floor(player.dailyCommissionClaimedAt))
    : 0;
  return claimedAt > 0 && claimedAt >= getDailyCommissionWindowStart(now);
}

function getDailyEligibleTemplates(/** @type {any} */ playerLevel = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(playerLevel) || 1));
  const allowedKinds = new Set(['hunt', 'gather', 'craft']);
  const matching = CONTRACT_TEMPLATES.filter((template) =>
    allowedKinds.has(template.kind) &&
    safeLevel >= template.levelMin &&
    safeLevel <= template.levelMax
  );
  if (matching.length > 0) return matching;
  return CONTRACT_TEMPLATES.filter((template) => allowedKinds.has(template.kind));
}

function resolveDailyCommissionVendorId(/** @type {any} */ template) {
  const poolKey = Array.isArray(template?.vendorPools) && template.vendorPools.includes('outpost')
    ? 'outpost'
    : 'starter';
  return (
    KNOWN_CONTRACT_VENDOR_IDS.find((vendorId) => getVendorContractPoolKey(vendorId) === poolKey) ??
    KNOWN_CONTRACT_VENDOR_IDS[0]
  );
}

function getDailyCommissionOfferForPlayer(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
  const activeContracts = createActiveContracts(player?.activeContracts);
  if (activeContracts.some((entry) => entry.bonusType === CONTRACT_BONUS_DAILY && entry.delivered !== true)) {
    return null;
  }
  if (hasClaimedDailyCommission(player, now)) {
    return null;
  }
  const windowStart = getDailyCommissionWindowStart(now);
  const eligible = getDailyEligibleTemplates(player?.level ?? 1);
  if (eligible.length === 0) return null;
  const seed = `${player?.id ?? 'player'}:${windowStart}`;
  const template = eligible[hashString(seed) % eligible.length];
  const resetAt = windowStart + DAILY_COMMISSION_RESET_MS;
  return {
    vendorId: resolveDailyCommissionVendorId(template),
    offer: buildContractOffer(template, {
      bonusType: CONTRACT_BONUS_DAILY,
      resetAt,
    }),
  };
}

export function getContractOfferForPlayer(/** @type {any} */ player, /** @type {any} */ vendorId, /** @type {any} */ contractId, /** @type {any} */ now = Date.now()) {
  if (typeof vendorId !== 'string' || typeof contractId !== 'string') return null;
  const snapshot = getContractSnapshotForPlayer(player, now);
  const offers = Array.isArray(snapshot.offersByVendor?.[vendorId]) ? snapshot.offersByVendor[vendorId] : [];
  return offers.find((offer) => offer.id === contractId) ?? null;
}

export function enrichActiveContract(/** @type {any} */ activeContract) {
  const template = getContractTemplateById(activeContract?.templateId);
  if (!template) return null;
  const progress = clampProgress(activeContract?.progress);
  const required = Math.max(1, template.requiredCount);
  const completed = !!activeContract?.completed || progress >= required;
  return {
    templateId: template.id,
    contractId: template.id,
    vendorId: activeContract.vendorId,
    acceptedAt: activeContract.acceptedAt ?? 0,
    progress,
    completed,
    delivered: !!activeContract?.delivered,
    title: template.title,
    kind: template.kind,
    target: template.target ?? null,
    requiredCount: required,
    deliveryItemKind: template.deliveryItemKind ?? null,
    deliveryItemCount: template.deliveryItemCount ?? null,
    rewardXp: template.rewardXp,
    rewardCopper: template.rewardCopper,
    rewardMastery: normalizeRewardMastery(template.rewardMastery),
    ...(activeContract?.bonusType === CONTRACT_BONUS_DAILY ? { bonusType: CONTRACT_BONUS_DAILY } : {}),
    ...(Number.isFinite(activeContract?.resetAt) ? { resetAt: Math.max(0, Math.floor(activeContract.resetAt)) } : {}),
  };
}

export function getContractSnapshotForPlayer(/** @type {any} */ player, /** @type {any} */ now = Date.now()) {
  const activeContracts = createActiveContracts(player?.activeContracts)
    .map((entry) => enrichActiveContract(entry))
    .filter(Boolean);
  const offersByVendor = getOffersByVendor(player?.level ?? 1, now);
  const dailyCommission = getDailyCommissionOfferForPlayer(player, now);
  if (dailyCommission?.vendorId && dailyCommission.offer) {
    const existing = Array.isArray(offersByVendor[dailyCommission.vendorId])
      ? [...offersByVendor[dailyCommission.vendorId]]
      : [];
    const duplicateIndex = existing.findIndex((offer) => offer.id === dailyCommission.offer.id);
    if (duplicateIndex >= 0) {
      existing[duplicateIndex] = {
        ...existing[duplicateIndex],
        bonusType: CONTRACT_BONUS_DAILY,
        resetAt: dailyCommission.offer.resetAt,
      };
    } else {
      existing.unshift(dailyCommission.offer);
    }
    offersByVendor[dailyCommission.vendorId] = existing;
  }
  return {
    offersByVendor,
    activeContracts,
  };
}
