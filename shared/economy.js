export const COPPER_PER_SILVER = 100;
export const SILVER_PER_GOLD = 100;
export const COPPER_PER_GOLD = COPPER_PER_SILVER * SILVER_PER_GOLD;

export const VENDOR_SELL_PRICES = {
  crystal: 10,
  ore: 15,
  herb: 12,
  wood: 8,
  flower: 10,
};

/** @type {{ kind: string, name: string, priceCopper: number, category?: string }[]} */
export const VENDOR_BUY_ITEMS = [
  { kind: 'weapon_training_sword', name: 'Training Sword', priceCopper: 50, category: 'weapon' },
  { kind: 'weapon_training_bow', name: 'Training Bow', priceCopper: 50, category: 'weapon' },
  { kind: 'weapon_training_staff', name: 'Training Staff', priceCopper: 50, category: 'weapon' },
  { kind: 'weapon_apprentice_wand', name: 'Apprentice Wand', priceCopper: 75, category: 'weapon' },
  { kind: 'consumable_minor_health_potion', name: 'Minor Health Potion', priceCopper: 25, category: 'consumable' },
  { kind: 'consumable_minor_mana_potion', name: 'Minor Mana Potion', priceCopper: 25, category: 'consumable' },
  { kind: 'armor_head_cloth', name: 'Cloth Cap', priceCopper: 40, category: 'armor' },
  { kind: 'armor_chest_leather', name: 'Leather Vest', priceCopper: 60, category: 'armor' },
  { kind: 'armor_legs_cloth', name: 'Cloth Leggings', priceCopper: 40, category: 'armor' },
  { kind: 'armor_feet_leather', name: 'Leather Boots', priceCopper: 45, category: 'armor' },
];

export const RESOURCE_TYPES = {
  crystal: { itemKind: 'crystal', itemName: 'Crystal', sellPrice: 10 },
  ore: { itemKind: 'ore', itemName: 'Iron Ore', sellPrice: 15 },
  herb: { itemKind: 'herb', itemName: 'Healing Herb', sellPrice: 12 },
  tree: { itemKind: 'wood', itemName: 'Wood', sellPrice: 8 },
  flower: { itemKind: 'flower', itemName: 'Flower', sellPrice: 10 },
};

/**
 * Get display name for an item kind. Used by crafting, vendor, etc.
 * @param {string} kind
 * @returns {string}
 */
export function getItemDisplayName(kind) {
  if (!kind || typeof kind !== 'string') return 'Item';
  const buyEntry = VENDOR_BUY_ITEMS.find((e) => e.kind === kind);
  if (buyEntry) return buyEntry.name;
  const resourceType = Object.values(RESOURCE_TYPES).find((r) => r.itemKind === kind);
  if (resourceType) return resourceType.itemName;
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getBuyPriceCopper(kind) {
  if (!kind) return 0;
  const entry = VENDOR_BUY_ITEMS.find((e) => e.kind === kind);
  return entry ? Number(entry.priceCopper) : 0;
}

export function getVendorCatalog() {
  return [...VENDOR_BUY_ITEMS];
}

export function getResourceConfig(type) {
  if (!type) return RESOURCE_TYPES.crystal;
  return RESOURCE_TYPES[type] ?? RESOURCE_TYPES.crystal;
}

export function getSellPriceCopper(kind) {
  if (!kind) return 0;
  return Number(VENDOR_SELL_PRICES[kind]) || 0;
}

export function splitCurrency(totalCopper) {
  const safeTotal = Math.max(0, Math.floor(Number(totalCopper) || 0));
  const gold = Math.floor(safeTotal / COPPER_PER_GOLD);
  const silver = Math.floor((safeTotal % COPPER_PER_GOLD) / COPPER_PER_SILVER);
  const copper = safeTotal % COPPER_PER_SILVER;
  return { gold, silver, copper };
}

export function formatCurrency(totalCopper) {
  const { gold, silver, copper } = splitCurrency(totalCopper);
  return `${gold}g ${silver}s ${copper}c`;
}
