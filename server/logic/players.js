// @ts-check
import { addItem, createInventory, countInventory } from './inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId, getResourceForClass } from '../../shared/classes.js';
import { createDefaultEquipment } from '../../shared/equipment.js';
import { getItemDisplayName } from '../../shared/economy.js';
import { computeDerivedStats } from '../../shared/attributes.js';

export const GUEST_STARTER_ITEMS = Object.freeze([
  { kind: 'crystal', count: 3 },
  { kind: 'ore', count: 2 },
  { kind: 'herb', count: 3 },
  { kind: 'weapon_training_bow', count: 1 },
  { kind: 'consumable_minor_health_potion', count: 2 },
  { kind: 'armor_head_cloth', count: 1 },
]);

export function createBasePlayerState(/** @type {any} */ { world, spawn, classId }) {
  const safeClassId = isValidClassId(classId) ? classId : DEFAULT_CLASS_ID;
  const equipment = createDefaultEquipment(safeClassId);
  const derived = computeDerivedStats({
    classId: safeClassId,
    level: 1,
    equipment,
  });
  const resourceDef = getResourceForClass(safeClassId);
  const resourceType = resourceDef?.type ?? null;
  const isManaClass = resourceType === 'mana';
  const resourceMax = isManaClass ? derived.maxMana : (resourceDef?.max ?? 0);
  const resource = resourceType === 'rage' ? 0 : resourceMax;
  const invSlots = world?.playerInvSlots ?? 0;
  const invStackMax = world?.playerInvStackMax ?? 1;
  const inventory = createInventory(invSlots);
  const inv = countInventory(inventory);
  const invCap = invSlots * invStackMax;

  return {
    pos: { x: spawn?.x ?? 0, y: spawn?.y ?? 0, z: spawn?.z ?? 0 },
    hp: derived.maxHp,
    maxHp: derived.maxHp,
    inv,
    invCap,
    invSlots,
    invStackMax,
    inventory,
    currencyCopper: 0,
    equipment,
    dead: false,
    respawnAt: 0,
    targetId: null,
    targetKind: null,
    classId: safeClassId,
    level: 1,
    xp: 0,
    attackCooldownUntil: 0,
    resourceType,
    resourceMax,
    resource,
    abilityCooldowns: {},
    globalCooldownUntil: 0,
    combatTagUntil: 0,
    lastMoveDir: null,
    movedThisTick: false,
    cast: null,
    moveSpeedMultiplier: 1,
    damageTakenMultiplier: 1,
    slowImmuneUntil: 0,
    defensiveStanceUntil: 0,
    partyId: null,
  };
}

export function seedGuestStarterInventory(/** @type {any} */ state) {
  if (!state?.inventory || !Array.isArray(state.inventory)) return state;
  const stackMax = Math.max(1, Number(state.invStackMax) || 1);
  for (const entry of GUEST_STARTER_ITEMS) {
    addItem(
      state.inventory,
      {
        kind: entry.kind,
        name: getItemDisplayName(entry.kind),
        count: entry.count,
      },
      stackMax
    );
  }
  state.inv = countInventory(state.inventory);
  return state;
}

export function respawnPlayer(/** @type {any} */ player, /** @type {any} */ spawn, /** @type {any} */ markDirty) {
  if (!player || !spawn) return;
  player.pos = { x: spawn.x, y: spawn.y ?? 0, z: spawn.z };
  player.hp = player.maxHp;
  player.dead = false;
  player.respawnAt = 0;
  player.targetId = null;
  player.targetKind = null;
  if (typeof markDirty === 'function') {
    markDirty(player);
  }
}
