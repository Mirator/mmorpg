export const COPPER_PER_SILVER = 100;
export const SILVER_PER_GOLD = 100;
export const COPPER_PER_GOLD = COPPER_PER_SILVER * SILVER_PER_GOLD;

export const VENDOR_SELL_PRICES = {
  crystal: 10,
};

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
