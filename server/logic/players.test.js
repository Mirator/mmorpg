import { describe, it, expect } from 'vitest';
import { createBasePlayerState, seedGuestStarterInventory } from './players.js';

describe('players', () => {
  it('seeds guest starter inventory without changing carrying capacity', () => {
    const state = createBasePlayerState({
      world: { playerInvSlots: 12, playerInvStackMax: 20 },
      spawn: { x: 4, y: 0, z: -3 },
      classId: 'fighter',
    });

    seedGuestStarterInventory(state);

    expect(state.invCap).toBe(240);
    expect(state.inv).toBe(12);
    expect(state.inventory.slice(0, 6)).toEqual([
      { kind: 'crystal', name: 'Crystal', count: 3, isStarter: true },
      { kind: 'ore', name: 'Iron Ore', count: 2, isStarter: true },
      { kind: 'herb', name: 'Healing Herb', count: 3, isStarter: true },
      { kind: 'weapon_training_bow', name: 'Training Bow', count: 1, isStarter: true },
      { kind: 'consumable_minor_health_potion', name: 'Minor Health Potion', count: 2, isStarter: true },
      { kind: 'armor_head_cloth', name: 'Cloth Cap', count: 1, isStarter: true },
    ]);
  });
});
