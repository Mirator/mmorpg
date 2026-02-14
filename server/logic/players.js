import { createInventory, countInventory } from './inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId, getResourceForClass } from '../../shared/classes.js';
import { createDefaultEquipment } from '../../shared/equipment.js';
import { computeDerivedStats } from '../../shared/attributes.js';

export function createBasePlayerState({ world, spawn, classId }) {
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

export function respawnPlayer(player, spawn, markDirty) {
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
