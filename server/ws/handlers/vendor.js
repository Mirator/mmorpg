import { getSellPriceCopper } from '../../../shared/economy.js';
import { createWeaponItem, getWeaponDef } from '../../../shared/equipment.js';
import { addItem } from '../../logic/inventory.js';
import { countInventory } from '../../logic/inventory.js';

export function handleVendorSell(ctx) {
  const { player, world, msg, persistence } = ctx;
  const vendor = world.vendors?.find((v) => v.id === msg.vendorId);
  if (!vendor) return;
  if (msg.slot < 0 || msg.slot >= player.inventory.length) return;
  const item = player.inventory[msg.slot];
  if (!item) return;
  const dist = Math.hypot(player.pos.x - vendor.x, player.pos.z - vendor.z);
  const maxDist = world.vendorInteractRadius ?? 2.5;
  if (dist > maxDist) return;
  const unitPrice = getSellPriceCopper(item.kind);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
  const count = Math.max(1, Number(item.count) || 1);
  const total = Math.floor(unitPrice * count);
  player.inventory[msg.slot] = null;
  player.inv = countInventory(player.inventory);
  player.currencyCopper = (player.currencyCopper ?? 0) + total;
  persistence.markDirty(player);
}

export function handleVendorBuy(ctx) {
  const { player, world, msg, persistence, nextItemIdRef } = ctx;
  const vendor = world.vendors?.find((v) => v.id === msg.vendorId);
  if (!vendor) return;
  const dist = Math.hypot(player.pos.x - vendor.x, player.pos.z - vendor.z);
  const maxDist = world.vendorInteractRadius ?? 2.5;
  if (dist > maxDist) return;
  const catalog = vendor.buyItems ?? [];
  const catalogEntry = catalog.find((e) => e.kind === msg.kind);
  if (!catalogEntry) return;
  const priceCopper = catalogEntry.priceCopper ?? 0;
  if (!Number.isFinite(priceCopper) || priceCopper <= 0) return;
  const count = Math.max(1, Math.min(Number(msg.count) || 1, 99));
  const total = priceCopper * count;
  const playerCopper = player.currencyCopper ?? 0;
  if (playerCopper < total) return;
  const stackMax = player.invStackMax ?? 20;
  const weaponDef = getWeaponDef(msg.kind);
  let item;
  if (weaponDef) {
    item = createWeaponItem(msg.kind);
    if (!item) return;
    for (let i = 1; i < count; i += 1) {
      const extra = createWeaponItem(msg.kind);
      if (!extra || !addItem(player.inventory, extra, stackMax)) return;
    }
  } else {
    item = {
      id: `i${nextItemIdRef.current++}`,
      kind: msg.kind,
      name: catalogEntry.name,
      count,
    };
  }
  if (!addItem(player.inventory, item, stackMax)) return;
  player.currencyCopper = playerCopper - total;
  player.inv = countInventory(player.inventory);
  persistence.markDirty(player);
}
