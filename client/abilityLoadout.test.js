import { describe, expect, it } from 'vitest';
import {
  clearAbilityLoadoutSlot,
  createAbilityLoadoutController,
  setAbilityInLoadoutState,
  swapAbilityLoadoutSlots,
  syncAbilityLoadoutState,
} from './abilityLoadout.js';

function makeAbilities() {
  return [
    { id: 'basic_attack', slot: 1 },
    { id: 'firebolt', slot: 2 },
    { id: 'frost_nova', slot: 3 },
    { id: 'meteor', slot: 9 },
  ];
}

describe('ability loadout', () => {
  it('builds the default loadout from preferred template slots', () => {
    const state = syncAbilityLoadoutState(makeAbilities(), null);
    expect(state.slots.slice(0, 3)).toEqual(['basic_attack', 'firebolt', 'frost_nova']);
    expect(state.slots[8]).toBe('meteor');
  });

  it('does not re-add manually removed skills but auto-slots newly learned skills', () => {
    const starting = syncAbilityLoadoutState(makeAbilities().slice(0, 3), null);
    const removed = clearAbilityLoadoutSlot(makeAbilities().slice(0, 3), starting, 3);
    const afterLevel = syncAbilityLoadoutState(makeAbilities(), removed);

    expect(afterLevel.slots[2]).toBe('meteor');
    expect(afterLevel.slots.includes('frost_nova')).toBe(false);
  });

  it('moves and swaps skills without duplicating them', () => {
    const base = syncAbilityLoadoutState(makeAbilities(), null);
    const moved = setAbilityInLoadoutState(makeAbilities(), base, 'meteor', 2);
    expect(moved.slots[1]).toBe('meteor');
    expect(moved.slots[8]).toBe('firebolt');

    const swapped = swapAbilityLoadoutSlots(makeAbilities(), moved, 1, 2);
    expect(swapped.slots[0]).toBe('meteor');
    expect(swapped.slots[1]).toBe('basic_attack');
  });

  it('persists slot choices in the controller', () => {
    const storage = {
      values: {},
      getItem(key) {
        return this.values[key] ?? null;
      },
      setItem(key, value) {
        this.values[key] = value;
      },
    };
    const controller = createAbilityLoadoutController({ storage });
    const ctx = { playerId: 'char-1', classId: 'mage', abilities: makeAbilities() };

    controller.clearSlot(ctx, 3);
    controller.setAbilityInSlot(ctx, 'meteor', 4);

    expect(controller.getSlotIds(ctx)[3]).toBe('meteor');
    expect(controller.getSlotIds(ctx).includes('frost_nova')).toBe(false);
  });
});
