import { createInventory, countInventory } from './inventory.js';
import { DEFAULT_CLASS_ID, isValidClassId } from '../../shared/classes.js';
import { createDefaultEquipment } from '../../shared/equipment.js';

export function createBasePlayerState({ world, spawn, classId }) {
  const safeClassId = isValidClassId(classId) ? classId : DEFAULT_CLASS_ID;
  const invSlots = world?.playerInvSlots ?? 0;
  const invStackMax = world?.playerInvStackMax ?? 1;
  const inventory = createInventory(invSlots);
  const inv = countInventory(inventory);
  const invCap = invSlots * invStackMax;

  return {
    pos: { x: spawn?.x ?? 0, y: 0, z: spawn?.z ?? 0 },
    hp: world?.playerMaxHp ?? 100,
    maxHp: world?.playerMaxHp ?? 100,
    inv,
    invCap,
    invSlots,
    invStackMax,
    inventory,
    currencyCopper: 0,
    equipment: createDefaultEquipment(safeClassId),
    dead: false,
    respawnAt: 0,
    classId: safeClassId,
    level: 1,
    xp: 0,
    attackCooldownUntil: 0,
  };
}
