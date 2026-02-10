// @ts-check
import { DEFAULT_CLASS_ID, getClassById } from './classes.js';

export const EQUIP_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet'];
const EQUIP_SLOT_SET = new Set(EQUIP_SLOTS);

export const WEAPON_DEFS = {
  weapon_training_sword: {
    kind: 'weapon_training_sword',
    name: 'Training Sword',
    attackType: 'melee',
    range: 2.0,
  },
  weapon_training_bow: {
    kind: 'weapon_training_bow',
    name: 'Training Bow',
    attackType: 'ranged',
    range: 6.0,
  },
  weapon_training_staff: {
    kind: 'weapon_training_staff',
    name: 'Training Staff',
    attackType: 'ranged',
    range: 6.0,
  },
  weapon_apprentice_wand: {
    kind: 'weapon_apprentice_wand',
    name: 'Apprentice Wand',
    attackType: 'ranged',
    range: 6.0,
  },
};

const DEFAULT_WEAPON_FALLBACK = 'weapon_training_sword';

const SLOT_PREFIXES = {
  weapon: ['weapon_'],
  offhand: ['offhand_', 'shield_'],
  head: ['armor_head_', 'head_'],
  chest: ['armor_chest_', 'chest_'],
  legs: ['armor_legs_', 'legs_'],
  feet: ['armor_feet_', 'boots_', 'feet_'],
};

function normalizeItemId(item, fallbackPrefix = 'eq') {
  if (typeof item?.id === 'string' && item.id.trim()) return item.id.trim();
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeItemName(item, fallbackName) {
  if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim();
  if (typeof fallbackName === 'string' && fallbackName.trim()) return fallbackName.trim();
  if (typeof item?.kind === 'string' && item.kind.trim()) return item.kind.trim();
  return 'Item';
}

function normalizeCount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, Math.floor(num));
}

export function getWeaponDef(kind) {
  if (!kind) return null;
  return WEAPON_DEFS[kind] ?? null;
}

export function getDefaultWeaponKind(classId) {
  const klass = getClassById(classId ?? DEFAULT_CLASS_ID);
  return klass?.defaultWeaponKind ?? DEFAULT_WEAPON_FALLBACK;
}

export function createWeaponItem(kind) {
  const safeKind = kind ?? DEFAULT_WEAPON_FALLBACK;
  const def = getWeaponDef(safeKind);
  if (!def) return null;
  return {
    id: normalizeItemId(null, 'weapon'),
    kind: def.kind,
    name: def.name,
    count: 1,
  };
}

function normalizeWeaponItem(item, fallbackKind) {
  const kind = typeof item?.kind === 'string' ? item.kind : fallbackKind;
  const def = getWeaponDef(kind);
  if (!def) return null;
  return {
    id: normalizeItemId(item, 'weapon'),
    kind: def.kind,
    name: normalizeItemName(item, def.name),
    count: 1,
  };
}

function normalizeGenericItem(item) {
  if (!item || typeof item.kind !== 'string' || !item.kind.trim()) return null;
  return {
    id: normalizeItemId(item, 'eq'),
    kind: item.kind.trim(),
    name: normalizeItemName(item, item.kind),
    count: normalizeCount(item.count),
  };
}

export function createDefaultEquipment(classId) {
  const equipment = Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null]));
  const defaultWeapon = createWeaponItem(getDefaultWeaponKind(classId));
  if (defaultWeapon) {
    equipment.weapon = defaultWeapon;
  }
  return equipment;
}

export function isItemAllowedInSlot(item, slot) {
  if (!EQUIP_SLOT_SET.has(slot)) return false;
  if (!item) return true;
  if (typeof item.kind !== 'string') return false;
  const prefixes = SLOT_PREFIXES[slot] ?? [];
  return prefixes.some((prefix) => item.kind.startsWith(prefix));
}

export function normalizeEquipment(raw, classId) {
  const base = Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null]));
  if (raw && typeof raw === 'object') {
    for (const slot of EQUIP_SLOTS) {
      const item = raw[slot];
      if (!item) continue;
      if (!isItemAllowedInSlot(item, slot)) continue;
      if (slot === 'weapon') {
        const normalized = normalizeWeaponItem(item);
        if (normalized) base.weapon = normalized;
      } else {
        const normalized = normalizeGenericItem(item);
        if (normalized) base[slot] = normalized;
      }
    }
  }

  if (!base.weapon) {
    base.weapon = createWeaponItem(getDefaultWeaponKind(classId));
  }

  return base;
}

export function getEquippedWeapon(equipment, classId) {
  const weaponKind = equipment?.weapon?.kind;
  const byEquip = getWeaponDef(weaponKind);
  if (byEquip) return byEquip;
  const fallbackKind = getDefaultWeaponKind(classId);
  return getWeaponDef(fallbackKind);
}
