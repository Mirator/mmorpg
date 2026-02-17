// @ts-check

/**
 * Loot table entry: { kind, minCount, maxCount, chancePct }
 * chancePct: 0-100, roll once per kill (100 = guaranteed)
 * minCount/maxCount: quantity range if drop succeeds
 *
 * @typedef {{ kind: string, minCount: number, maxCount: number, chancePct: number }} LootEntry
 */

/** @type {Record<string, LootEntry[]>} */
export const MOB_LOOT_TABLES = {
  dummy: [],

  fox: [
    { kind: 'flower', minCount: 1, maxCount: 2, chancePct: 40 },
    { kind: 'herb', minCount: 0, maxCount: 1, chancePct: 20 },
  ],

  stag: [
    { kind: 'herb', minCount: 1, maxCount: 2, chancePct: 50 },
    { kind: 'flower', minCount: 1, maxCount: 3, chancePct: 35 },
    { kind: 'wood', minCount: 0, maxCount: 1, chancePct: 15 },
  ],

  tribal: [
    { kind: 'ore', minCount: 1, maxCount: 2, chancePct: 55 },
    { kind: 'herb', minCount: 0, maxCount: 2, chancePct: 40 },
    { kind: 'crystal', minCount: 0, maxCount: 1, chancePct: 15 },
    { kind: 'weapon_training_sword', minCount: 1, maxCount: 1, chancePct: 3 },
  ],

  wolf: [
    { kind: 'herb', minCount: 1, maxCount: 2, chancePct: 60 },
    { kind: 'ore', minCount: 0, maxCount: 1, chancePct: 25 },
    { kind: 'consumable_minor_health_potion', minCount: 1, maxCount: 1, chancePct: 5 },
  ],

  orc: [
    { kind: 'ore', minCount: 1, maxCount: 3, chancePct: 80 },
    { kind: 'crystal', minCount: 0, maxCount: 2, chancePct: 30 },
    { kind: 'herb', minCount: 0, maxCount: 2, chancePct: 25 },
    { kind: 'weapon_training_sword', minCount: 1, maxCount: 1, chancePct: 2 },
    { kind: 'armor_chest_leather', minCount: 1, maxCount: 1, chancePct: 1 },
  ],

  bull: [
    { kind: 'ore', minCount: 1, maxCount: 2, chancePct: 45 },
    { kind: 'herb', minCount: 2, maxCount: 4, chancePct: 70 },
    { kind: 'consumable_minor_health_potion', minCount: 1, maxCount: 2, chancePct: 15 },
    { kind: 'armor_legs_cloth', minCount: 1, maxCount: 1, chancePct: 3 },
  ],

  demon: [
    { kind: 'crystal', minCount: 2, maxCount: 5, chancePct: 90 },
    { kind: 'ore', minCount: 1, maxCount: 4, chancePct: 70 },
    { kind: 'consumable_minor_mana_potion', minCount: 1, maxCount: 2, chancePct: 25 },
    { kind: 'weapon_apprentice_wand', minCount: 1, maxCount: 1, chancePct: 4 },
    { kind: 'armor_head_cloth', minCount: 1, maxCount: 1, chancePct: 5 },
  ],

  yeti: [
    { kind: 'ore', minCount: 2, maxCount: 4, chancePct: 75 },
    { kind: 'crystal', minCount: 1, maxCount: 3, chancePct: 60 },
    { kind: 'herb', minCount: 1, maxCount: 3, chancePct: 50 },
    { kind: 'armor_feet_leather', minCount: 1, maxCount: 1, chancePct: 6 },
  ],
};

