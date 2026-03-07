// @ts-check
import { DEFAULT_CLASS_ID, getClassById } from './classes.js';

export const /** @type {any} */ EQUIP_SLOTS = ['weapon', 'offhand', 'head', 'chest', 'legs', 'feet'];
const EQUIP_SLOT_SET = new Set(EQUIP_SLOTS);

export const /** @type {any} */ WEAPON_DEFS = {
  weapon_training_sword: {
    kind: 'weapon_training_sword',
    name: 'Training Sword',
    attackType: 'melee',
    range: 2.0,
    family: 'Blade',
    speedTier: 'medium',
    flavor: 'Reliable steel for balanced melee strikes.',
  },
  weapon_training_bow: {
    kind: 'weapon_training_bow',
    name: 'Training Bow',
    attackType: 'ranged',
    range: 6.0,
    family: 'Bow',
    speedTier: 'fast',
    flavor: 'Flexible bow tuned for quick ranged pressure.',
  },
  weapon_training_staff: {
    kind: 'weapon_training_staff',
    name: 'Training Staff',
    attackType: 'ranged',
    range: 6.0,
    family: 'Staff',
    speedTier: 'slow',
    flavor: 'Arcane focus with steady, long-reaching casts.',
  },
  weapon_apprentice_wand: {
    kind: 'weapon_apprentice_wand',
    name: 'Apprentice Wand',
    attackType: 'ranged',
    range: 6.0,
    family: 'Wand',
    speedTier: 'fast',
    flavor: 'Channel precise spell bolts with rapid cadence.',
  },
  weapon_iron_blade: {
    kind: 'weapon_iron_blade',
    name: 'Iron Blade',
    attackType: 'melee',
    range: 2.2,
    family: 'Blade',
    speedTier: 'medium',
    flavor: 'Forged edge that rewards disciplined footwork.',
  },
  weapon_reinforced_training_sword: {
    kind: 'weapon_reinforced_training_sword',
    name: 'Reinforced Training Sword',
    attackType: 'melee',
    range: 2.3,
    family: 'Blade',
    speedTier: 'slow',
    flavor: 'Heavier swings hit harder at the cost of tempo.',
  },
  weapon_reinforced_training_bow: {
    kind: 'weapon_reinforced_training_bow',
    name: 'Reinforced Training Bow',
    attackType: 'ranged',
    range: 6.5,
    family: 'Bow',
    speedTier: 'medium',
    flavor: 'Sturdier limbs extend reach with stronger draw.',
  },
};

const DEFAULT_WEAPON_FALLBACK = 'weapon_training_sword';

const /** @type {any} */ SLOT_PREFIXES = {
  weapon: ['weapon_'],
  offhand: ['offhand_', 'shield_'],
  head: ['armor_head_', 'head_'],
  chest: ['armor_chest_', 'chest_'],
  legs: ['armor_legs_', 'legs_'],
  feet: ['armor_feet_', 'boots_', 'feet_'],
};

/** @typedef {{ id: string, kind: string, name: string, count: number }} EquipmentItem */
/** @typedef {{ weapon: EquipmentItem | null, offhand: EquipmentItem | null, head: EquipmentItem | null, chest: EquipmentItem | null, legs: EquipmentItem | null, feet: EquipmentItem | null }} EquipmentState */

export const /** @type {any} */ DURABILITY_BY_RARITY = {
  common: 20,
  uncommon: 30,
  rare: 40,
  epic: 50,
};

const DEFAULT_OUTFIT_STYLE = 'cloth';

export const /** @type {any} */ OUTFIT_STYLES = ['cloth', 'leather'];
const OUTFIT_STYLE_SET = new Set(OUTFIT_STYLES);

export const /** @type {any} */ ARMOR_KIND_TO_OUTFIT_STYLE = {
  armor_head_cloth: 'cloth',
  armor_chest_leather: 'leather',
  armor_legs_cloth: 'cloth',
  armor_feet_leather: 'leather',
  armor_chest_crude_plate: 'leather',
};

function normalizeItemId(/** @type {any} */ item, /** @type {any} */ fallbackPrefix = 'eq') {
  if (typeof item?.id === 'string' && item.id.trim()) return item.id.trim();
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeItemName(/** @type {any} */ item, /** @type {any} */ fallbackName) {
  if (typeof item?.name === 'string' && item.name.trim()) return item.name.trim();
  if (typeof fallbackName === 'string' && fallbackName.trim()) return fallbackName.trim();
  if (typeof item?.kind === 'string' && item.kind.trim()) return item.kind.trim();
  return 'Item';
}

function normalizeCount(/** @type {any} */ value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.max(1, Math.floor(num));
}

function normalizeDurability(/** @type {any} */ value, /** @type {any} */ fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

function normalizeItemMeta(/** @type {any} */ raw, /** @type {any} */ defaults = {}) {
  const rarity = typeof raw?.rarity === 'string'
    ? raw.rarity
    : typeof defaults?.rarity === 'string'
      ? defaults.rarity
      : undefined;
  const craftedProfession = typeof raw?.craftedProfession === 'string'
    ? raw.craftedProfession
    : typeof defaults?.craftedProfession === 'string'
      ? defaults.craftedProfession
      : undefined;
  const maxDurability = normalizeDurability(
    raw?.maxDurability,
    Number.isFinite(defaults?.maxDurability) ? defaults.maxDurability : undefined
  );
  const durability = normalizeDurability(
    raw?.durability,
    Number.isFinite(defaults?.durability) ? defaults.durability : maxDurability
  );
  const isStarter = raw?.isStarter === true || defaults?.isStarter === true;
  const sourceRecipeId = typeof raw?.sourceRecipeId === 'string'
    ? raw.sourceRecipeId
    : typeof defaults?.sourceRecipeId === 'string'
      ? defaults.sourceRecipeId
      : undefined;
  return {
    ...(rarity ? { rarity } : {}),
    ...(Number.isFinite(maxDurability) ? { maxDurability } : {}),
    ...(Number.isFinite(durability) ? { durability } : {}),
    ...(craftedProfession ? { craftedProfession } : {}),
    ...(isStarter ? { isStarter: true } : {}),
    ...(sourceRecipeId ? { sourceRecipeId } : {}),
  };
}

function applyItemMeta(/** @type {any} */ item, /** @type {any} */ raw, /** @type {any} */ defaults = {}) {
  return {
    ...item,
    ...normalizeItemMeta(raw, defaults),
  };
}

export function getWeaponDef(/** @type {any} */ kind) {
  if (!kind) return null;
  return WEAPON_DEFS[kind] ?? null;
}

export function getDefaultWeaponKind(/** @type {any} */ classId) {
  const klass = getClassById(classId ?? DEFAULT_CLASS_ID);
  return klass?.defaultWeaponKind ?? DEFAULT_WEAPON_FALLBACK;
}

export function createWeaponItem(/** @type {any} */ kind, /** @type {any} */ options = {}) {
  const safeKind = kind ?? DEFAULT_WEAPON_FALLBACK;
  const def = getWeaponDef(safeKind);
  if (!def) return null;
  return applyItemMeta({
    id: normalizeItemId(null, 'weapon'),
    kind: def.kind,
    name: def.name,
    count: 1,
  }, options, options);
}

function normalizeWeaponItem(/** @type {any} */ item, /** @type {any} */ fallbackKind) {
  const kind = typeof item?.kind === 'string' ? item.kind : fallbackKind;
  const def = getWeaponDef(kind);
  if (!def) return null;
  return applyItemMeta({
    id: normalizeItemId(item, 'weapon'),
    kind: def.kind,
    name: normalizeItemName(item, def.name),
    count: 1,
  }, item);
}

function normalizeGenericItem(/** @type {any} */ item) {
  if (!item || typeof item.kind !== 'string' || !item.kind.trim()) return null;
  return applyItemMeta({
    id: normalizeItemId(item, 'eq'),
    kind: item.kind.trim(),
    name: normalizeItemName(item, item.kind),
    count: normalizeCount(item.count),
  }, item);
}

export function createDefaultEquipment(/** @type {any} */ classId) {
  const equipment = /** @type {EquipmentState} */ (
    Object.fromEntries(EQUIP_SLOTS.map((/** @type {any} */ slot) => [slot, null]))
  );
  const defaultWeapon = createWeaponItem(getDefaultWeaponKind(classId), { isStarter: true });
  if (defaultWeapon) {
    equipment.weapon = defaultWeapon;
  }
  return equipment;
}

export function isItemAllowedInSlot(/** @type {any} */ item, /** @type {any} */ slot) {
  if (!EQUIP_SLOT_SET.has(slot)) return false;
  if (!item) return true;
  if (typeof item.kind !== 'string') return false;
  const prefixes = SLOT_PREFIXES[slot] ?? [];
  return prefixes.some((/** @type {any} */ prefix) => item.kind.startsWith(prefix));
}

export function normalizeEquipment(/** @type {any} */ raw, /** @type {any} */ classId) {
  const base = /** @type {EquipmentState} */ (
    Object.fromEntries(EQUIP_SLOTS.map((/** @type {any} */ slot) => [slot, null]))
  );
  if (raw && typeof raw === 'object') {
    for (const slot of EQUIP_SLOTS) {
      const item = raw[slot];
      if (!item) continue;
      if (!isItemAllowedInSlot(item, slot)) continue;
      if (slot === 'weapon') {
        const normalized = normalizeWeaponItem(item, DEFAULT_WEAPON_FALLBACK);
        if (normalized) base.weapon = normalized;
      } else {
        const normalized = normalizeGenericItem(item);
        if (normalized) base[/** @type {keyof EquipmentState} */ (slot)] = normalized;
      }
    }
  }

  if (!base.weapon) {
    base.weapon = createWeaponItem(getDefaultWeaponKind(classId), { isStarter: true });
  }

  return base;
}

export function getEquippedWeapon(/** @type {any} */ equipment, /** @type {any} */ classId) {
  const weaponKind = equipment?.weapon?.kind;
  const byEquip = getWeaponDef(weaponKind);
  if (byEquip) return byEquip;
  const fallbackKind = getDefaultWeaponKind(classId);
  return getWeaponDef(fallbackKind);
}

function normalizeItemKind(/** @type {any} */ value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOutfitStyle(/** @type {any} */ value) {
  if (typeof value !== 'string') return DEFAULT_OUTFIT_STYLE;
  return OUTFIT_STYLE_SET.has(value) ? value : DEFAULT_OUTFIT_STYLE;
}

function resolveOutfitStyleForKind(/** @type {any} */ itemKind) {
  const normalizedKind = normalizeItemKind(itemKind);
  if (!normalizedKind) return null;
  if (ARMOR_KIND_TO_OUTFIT_STYLE[normalizedKind]) {
    return ARMOR_KIND_TO_OUTFIT_STYLE[normalizedKind];
  }
  if (normalizedKind.includes('leather') || normalizedKind.includes('plate')) return 'leather';
  if (normalizedKind.includes('cloth')) return 'cloth';
  return null;
}

export function resolveOutfitStyleFromEquipment(/** @type {any} */ equipment) {
  const slotPriority = ['chest', 'legs', 'feet', 'head'];
  for (const slot of slotPriority) {
    const style = resolveOutfitStyleForKind(equipment?.[slot]?.kind);
    if (style) return style;
  }
  return DEFAULT_OUTFIT_STYLE;
}

/**
 * @param {any} equipment
 * @returns {{ outfitStyle: string, headKind: string | null, weaponKind: string | null, offhandKind: string | null }}
 */
export function buildEquipmentVisualState(equipment) {
  return {
    outfitStyle: resolveOutfitStyleFromEquipment(equipment),
    headKind: normalizeItemKind(equipment?.head?.kind),
    weaponKind: normalizeItemKind(equipment?.weapon?.kind),
    offhandKind: normalizeItemKind(equipment?.offhand?.kind),
  };
}

/**
 * @param {any} visual
 * @returns {{ outfitStyle: string, headKind: string | null, weaponKind: string | null, offhandKind: string | null }}
 */
export function normalizeEquipmentVisualState(visual) {
  return {
    outfitStyle: normalizeOutfitStyle(visual?.outfitStyle),
    headKind: normalizeItemKind(visual?.headKind),
    weaponKind: normalizeItemKind(visual?.weaponKind),
    offhandKind: normalizeItemKind(visual?.offhandKind),
  };
}

export function buildEquipmentVisualSignature(/** @type {any} */ visual) {
  const normalized = normalizeEquipmentVisualState(visual);
  return [
    `outfit:${normalized.outfitStyle}`,
    `head:${normalized.headKind ?? '-'}`,
    `weapon:${normalized.weaponKind ?? '-'}`,
    `offhand:${normalized.offhandKind ?? '-'}`,
  ].join('|');
}

/**
 * Sum stats from all equipped items. Phase 1: returns zeros until items have stats.
 * @param {Object} equipment - Equipment slot map
 * @returns {{ str?: number, dex?: number, int?: number, vit?: number, spi?: number, armor?: number, magicResist?: number, accuracy?: number, evasion?: number }}
 */
export function getStatsFromEquipment(equipment) {
  if (!equipment || typeof equipment !== 'object') {
    return { str: 0, dex: 0, int: 0, vit: 0, spi: 0, armor: 0, magicResist: 0, accuracy: 0, evasion: 0 };
  }
  const /** @type {any} */ stats = { str: 0, dex: 0, int: 0, vit: 0, spi: 0, armor: 0, magicResist: 0, accuracy: 0, evasion: 0 };
  for (const slot of EQUIP_SLOTS) {
    const item = /** @type {any} */ (equipment)[slot];
    if (!item) continue;
    if (isBrokenItem(item)) continue;
    const def = getItemStats(item.kind);
    if (def) {
      stats.str += def.str ?? 0;
      stats.dex += def.dex ?? 0;
      stats.int += def.int ?? 0;
      stats.vit += def.vit ?? 0;
      stats.spi += def.spi ?? 0;
      stats.armor += def.armor ?? 0;
      stats.magicResist += def.magicResist ?? 0;
      stats.accuracy += def.accuracy ?? 0;
      stats.evasion += def.evasion ?? 0;
    }
  }
  return stats;
}

/**
 * Item stats by kind (spec Section 9). Training gear has small bonuses.
 * @param {string} kind
 * @returns {{ str?: number, dex?: number, int?: number, vit?: number, spi?: number, armor?: number, magicResist?: number, accuracy?: number, evasion?: number } | null}
 */
function getItemStats(kind) {
  const /** @type {any} */ ITEM_STATS = {
    weapon_training_sword: { str: 2 },
    weapon_training_bow: { dex: 2 },
    weapon_training_staff: { int: 2 },
    weapon_apprentice_wand: { int: 3, spi: 1 },
    weapon_iron_blade: { str: 4 },
    weapon_reinforced_training_sword: { str: 6, vit: 1 },
    weapon_reinforced_training_bow: { dex: 5, accuracy: 6 },
    armor_head_cloth: { armor: 2 },
    armor_chest_leather: { armor: 4 },
    armor_legs_cloth: { armor: 2 },
    armor_feet_leather: { armor: 2 },
    armor_chest_crude_plate: { armor: 7, vit: 2 },
    offhand_wooden_focus: { int: 2, spi: 2, magicResist: 2 },
  };
  return ITEM_STATS[kind] ?? null;
}

export function isDurabilityTrackedItem(/** @type {any} */ item) {
  if (!item || item.isStarter === true) return false;
  return Number.isFinite(item.maxDurability) && item.maxDurability > 0;
}

export function isBrokenItem(/** @type {any} */ item) {
  if (!isDurabilityTrackedItem(item)) return false;
  return (item.durability ?? 0) <= 0;
}

export function applyDurabilityLoss(/** @type {any} */ item, /** @type {any} */ amount = 1) {
  if (!isDurabilityTrackedItem(item)) return false;
  const loss = Math.max(0, Math.floor(Number(amount) || 0));
  if (loss <= 0) return false;
  const next = Math.max(0, (item.durability ?? item.maxDurability ?? 0) - loss);
  if (next === (item.durability ?? item.maxDurability ?? 0)) return false;
  item.durability = next;
  return true;
}

export function repairDurability(/** @type {any} */ item) {
  if (!isDurabilityTrackedItem(item)) return false;
  const maxDurability = Math.max(0, Math.floor(Number(item.maxDurability) || 0));
  if (maxDurability <= 0) return false;
  if ((item.durability ?? maxDurability) >= maxDurability) return false;
  item.durability = maxDurability;
  return true;
}

export function getMissingDurability(/** @type {any} */ item) {
  if (!isDurabilityTrackedItem(item)) return 0;
  const maxDurability = Math.max(0, Math.floor(Number(item.maxDurability) || 0));
  const durability = Math.max(0, Math.floor(Number(item.durability) || 0));
  return Math.max(0, maxDurability - durability);
}
