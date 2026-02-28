// @ts-check
import { createInventory, countInventory } from '../logic/inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../../shared/classes.js';
import { normalizeEquipment } from '../../shared/equipment.js';
import { computeDerivedStats } from '../../shared/attributes.js';
import { createActiveContracts } from '../../shared/contracts.js';
import { createProfessionMasteries } from '../../shared/professions.js';
import { getDefaultKnownRecipeIds } from '../../shared/recipes.js';

export const PLAYER_STATE_VERSION = 3;

/** @typedef {{ id: string, kind: string, name: string, count: number }} InventoryItem */

function toNumber(/** @type {any} */ value, /** @type {any} */ fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(/** @type {any} */ value, /** @type {any} */ min, /** @type {any} */ max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizePos(/** @type {any} */ raw, /** @type {any} */ world, /** @type {any} */ spawn) {
  const half = Number.isFinite(world?.mapSize) ? world.mapSize / 2 : 200;
  const fallback = spawn ?? { x: 0, y: 0, z: 0 };
  const x = Number.isFinite(raw?.x) ? clamp(raw.x, -half, half) : fallback.x;
  const z = Number.isFinite(raw?.z) ? clamp(raw.z, -half, half) : fallback.z;
  let y = Number.isFinite(raw?.y) ? raw.y : (fallback.y ?? 0);
  if (Number.isFinite(world?.mapYMin) && Number.isFinite(world?.mapYMax)) {
    y = clamp(y, world.mapYMin, world.mapYMax);
  }
  return { x, y, z };
}

function sanitizeInventory(/** @type {any} */ raw, /** @type {any} */ slots, /** @type {any} */ stackMax) {
  const inventory = /** @type {Array<InventoryItem | null>} */ (createInventory(slots));
  if (!Array.isArray(raw)) return inventory;

  for (let i = 0; i < inventory.length && i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item.kind !== 'string' || item.kind.length === 0) {
      inventory[i] = null;
      continue;
    }
    const count = clamp(toNumber(item.count, 1), 1, stackMax);
    const id = typeof item.id === 'string' ? item.id : `item-${Date.now()}-${i}`;
    const name = typeof item.name === 'string' ? item.name : item.kind;
    inventory[i] = {
      id,
      kind: item.kind,
      name,
      count,
      ...(typeof item.rarity === 'string' ? { rarity: item.rarity } : {}),
      ...(Number.isFinite(item.maxDurability) ? { maxDurability: Math.max(0, Math.floor(item.maxDurability)) } : {}),
      ...(Number.isFinite(item.durability) ? { durability: Math.max(0, Math.floor(item.durability)) } : {}),
      ...(typeof item.craftedProfession === 'string' ? { craftedProfession: item.craftedProfession } : {}),
      ...(item.isStarter === true ? { isStarter: true } : {}),
      ...(typeof item.sourceRecipeId === 'string' ? { sourceRecipeId: item.sourceRecipeId } : {}),
    };
  }

  return inventory;
}

export function serializePlayerState(/** @type {any} */ player) {
  return {
    pos: {
      x: toNumber(player?.pos?.x, 0),
      y: toNumber(player?.pos?.y, 0),
      z: toNumber(player?.pos?.z, 0),
    },
    hp: toNumber(player?.hp, 0),
    maxHp: toNumber(player?.maxHp, 0),
    inventory: Array.isArray(player?.inventory) ? player.inventory : [],
    currencyCopper: toNumber(player?.currencyCopper, 0),
    equipment: player?.equipment ?? null,
    classId: typeof player?.classId === 'string' ? player.classId : DEFAULT_CLASS_ID,
    level: toNumber(player?.level, 1),
    xp: toNumber(player?.xp, 0),
    invSlots: toNumber(player?.invSlots, 0),
    invStackMax: toNumber(player?.invStackMax, 1),
    activeContracts: createActiveContracts(player?.activeContracts),
    professionMasteries: createProfessionMasteries(player?.professionMasteries),
    knownRecipes: Array.isArray(player?.knownRecipes)
      ? player.knownRecipes.filter((/** @type {any} */ id) => typeof id === 'string')
      : getDefaultKnownRecipeIds(),
  };
}

export function migratePlayerState(/** @type {any} */ rawState, /** @type {any} */ version) {
  const currentVersion = Number.isInteger(version) ? version : 0;
  if (currentVersion > PLAYER_STATE_VERSION) {
    return { state: rawState ?? {}, version: currentVersion, didUpgrade: false };
  }
  let state = rawState ?? {};
  let didUpgrade = false;

  if (currentVersion < 1) {
    state = {
      ...state,
      currencyCopper: Number.isFinite(state?.currencyCopper) ? state.currencyCopper : 0,
      classId:
        typeof state?.classId === 'string' && isValidClassId(state.classId)
          ? state.classId
          : DEFAULT_CLASS_ID,
      level: Number.isFinite(state?.level) ? state.level : 1,
      xp: Number.isFinite(state?.xp) ? state.xp : 0,
      invSlots: Number.isFinite(state?.invSlots) ? state.invSlots : undefined,
      invStackMax: Number.isFinite(state?.invStackMax) ? state.invStackMax : undefined,
    };
    didUpgrade = true;
  }

  if (currentVersion < 2) {
    const classId =
      typeof state?.classId === 'string' && isValidClassId(state.classId)
        ? state.classId
        : DEFAULT_CLASS_ID;
    state = {
      ...state,
      equipment: state?.equipment ?? null,
      classId,
    };
    didUpgrade = true;
  }

  if (currentVersion < 3) {
    state = {
      ...state,
      activeContracts: createActiveContracts(state?.activeContracts),
      professionMasteries: createProfessionMasteries(state?.professionMasteries),
      knownRecipes: Array.isArray(state?.knownRecipes)
        ? state.knownRecipes.filter((/** @type {any} */ id) => typeof id === 'string')
        : getDefaultKnownRecipeIds(),
    };
    didUpgrade = true;
  }

  return { state, version: PLAYER_STATE_VERSION, didUpgrade };
}

export function hydratePlayerState(/** @type {any} */ rawState, /** @type {any} */ world, /** @type {any} */ spawn) {
  const pos = sanitizePos(rawState?.pos, world, spawn);

  const invSlots = Math.max(0, Math.floor(toNumber(world?.playerInvSlots, 0)));
  const invStackMax = Math.max(1, Math.floor(toNumber(world?.playerInvStackMax, 1)));
  const inventory = sanitizeInventory(rawState?.inventory, invSlots, invStackMax);
  const inv = countInventory(inventory);
  const invCap = invSlots * invStackMax;

  const classId =
    typeof rawState?.classId === 'string' && isValidClassId(rawState.classId)
      ? rawState.classId
      : DEFAULT_CLASS_ID;
  const level = Math.max(1, Math.floor(toNumber(rawState?.level, 1)));
  const xp = Math.max(0, Math.floor(toNumber(rawState?.xp, 0)));
  const currencyCopper = Math.max(0, Math.floor(toNumber(rawState?.currencyCopper, 0)));
  const equipment = normalizeEquipment(rawState?.equipment, classId);
  const activeContracts = createActiveContracts(rawState?.activeContracts);
  const professionMasteries = createProfessionMasteries(rawState?.professionMasteries);
  const knownRecipes = Array.isArray(rawState?.knownRecipes)
    ? Array.from(new Set(rawState.knownRecipes.filter((/** @type {any} */ id) => typeof id === 'string')))
    : getDefaultKnownRecipeIds();

  const derived = computeDerivedStats({ classId, level, equipment });
  const maxHp = derived.maxHp;
  let hp = toNumber(rawState?.hp, maxHp);
  if (hp <= 0) {
    hp = maxHp;
  } else {
    hp = clamp(hp, 1, maxHp);
  }

  return {
    pos,
    hp,
    maxHp,
    inv,
    invCap,
    invSlots,
    invStackMax,
    inventory,
    currencyCopper,
    equipment,
    classId,
    level,
    xp,
    activeContracts,
    professionMasteries,
    knownRecipes,
  };
}
