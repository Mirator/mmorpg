import { createInventory, countInventory } from '../logic/inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../../shared/classes.js';

export const PLAYER_STATE_VERSION = 1;

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizePos(raw, world, spawn) {
  const half = Number.isFinite(world?.mapSize) ? world.mapSize / 2 : 200;
  const fallback = spawn ?? { x: 0, z: 0 };
  const x = Number.isFinite(raw?.x) ? clamp(raw.x, -half, half) : fallback.x;
  const z = Number.isFinite(raw?.z) ? clamp(raw.z, -half, half) : fallback.z;
  return { x, y: 0, z };
}

function sanitizeInventory(raw, slots, stackMax) {
  const inventory = createInventory(slots);
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
    };
  }

  return inventory;
}

export function serializePlayerState(player) {
  return {
    pos: {
      x: toNumber(player?.pos?.x, 0),
      z: toNumber(player?.pos?.z, 0),
    },
    hp: toNumber(player?.hp, 0),
    maxHp: toNumber(player?.maxHp, 0),
    inventory: Array.isArray(player?.inventory) ? player.inventory : [],
    currencyCopper: toNumber(player?.currencyCopper, 0),
    classId: typeof player?.classId === 'string' ? player.classId : DEFAULT_CLASS_ID,
    level: toNumber(player?.level, 1),
    xp: toNumber(player?.xp, 0),
    invSlots: toNumber(player?.invSlots, 0),
    invStackMax: toNumber(player?.invStackMax, 1),
  };
}

export function hydratePlayerState(rawState, world, spawn) {
  const pos = sanitizePos(rawState?.pos, world, spawn);
  const maxHp = toNumber(world?.playerMaxHp, 100);
  let hp = toNumber(rawState?.hp, maxHp);
  if (hp <= 0) {
    hp = maxHp;
  } else {
    hp = clamp(hp, 1, maxHp);
  }

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
    classId,
    level,
    xp,
  };
}
