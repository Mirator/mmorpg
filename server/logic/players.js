// @ts-check
import { addItem, createInventory, countInventory } from './inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId, getResourceForClass } from '../../shared/classes.js';
import { createDefaultEquipment } from '../../shared/equipment.js';
import { getItemDisplayName } from '../../shared/economy.js';
import { computeDerivedStats } from '../../shared/attributes.js';
import { createProfessionMasteries } from '../../shared/professions.js';
import { getDefaultKnownRecipeIds, getUnlockedRecipeIdsForMasteries } from '../../shared/recipes.js';

export const GUEST_STARTER_ITEMS = Object.freeze([
  { kind: 'crystal', count: 3 },
  { kind: 'ore', count: 2 },
  { kind: 'herb', count: 3 },
  { kind: 'weapon_training_bow', count: 1 },
  { kind: 'consumable_minor_health_potion', count: 2 },
  { kind: 'armor_head_cloth', count: 1 },
]);

const E2E_MIN_STARTER_ITEMS = Object.freeze([
  { kind: 'crystal', count: 4 },
  { kind: 'ore', count: 8 },
  { kind: 'herb', count: 4 },
  { kind: 'wood', count: 6 },
]);

function countItemKind(/** @type {any} */ inventory, /** @type {any} */ kind) {
  if (!Array.isArray(inventory) || typeof kind !== 'string' || kind.length === 0) return 0;
  return inventory.reduce((total, item) => {
    if (!item || item.kind !== kind) return total;
    return total + Math.max(0, Math.floor(Number(item.count) || 0));
  }, 0);
}

function ensureInventoryCount(/** @type {any} */ state, /** @type {any} */ kind, /** @type {any} */ minCount) {
  if (!state?.inventory || !Array.isArray(state.inventory)) return;
  const needed = Math.max(0, Math.floor(Number(minCount) || 0));
  if (needed <= 0) return;
  const current = countItemKind(state.inventory, kind);
  if (current >= needed) return;
  addItem(
    state.inventory,
    {
      kind,
      name: getItemDisplayName(kind),
      count: needed - current,
      isStarter: true,
    },
    Math.max(1, Number(state.invStackMax) || 1)
  );
}

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
    activeContracts: [],
    professionMasteries: createProfessionMasteries(),
    knownRecipes: getDefaultKnownRecipeIds(),
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
        isStarter: true,
      },
      stackMax
    );
  }
  state.inv = countInventory(state.inventory);
  return state;
}

export function applyE2eTestBoosts(/** @type {any} */ state) {
  if (!state?.inventory || !Array.isArray(state.inventory)) return state;

  for (const entry of E2E_MIN_STARTER_ITEMS) {
    ensureInventoryCount(state, entry.kind, entry.count);
  }

  state.currencyCopper = Math.max(80, Math.floor(Number(state.currencyCopper) || 0));

  const professionMasteries = createProfessionMasteries(state.professionMasteries);
  if ((professionMasteries.smithing?.level ?? 1) < 2) {
    professionMasteries.smithing = { level: 2, xp: 0 };
  }
  if ((professionMasteries.woodcraft?.level ?? 1) < 2) {
    professionMasteries.woodcraft = { level: 2, xp: 0 };
  }
  state.professionMasteries = professionMasteries;

  const unlockedRecipeIds = getUnlockedRecipeIdsForMasteries(professionMasteries);
  state.knownRecipes = Array.from(
    new Set([
      ...(Array.isArray(state.knownRecipes) ? state.knownRecipes : getDefaultKnownRecipeIds()),
      ...unlockedRecipeIds,
    ])
  );

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
