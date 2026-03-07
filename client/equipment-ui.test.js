import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEquipmentUI } from './equipment.js';
import { FakeElement } from './test/fakeDom.js';

describe('equipment ui interactions', () => {
  const originalDocument = global.document;
  const originalWindow = global.window;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
      elementFromPoint: () => null,
    };
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  it('emits quick-unequip callback on double-click', () => {
    const grid = new FakeElement('div');
    const calls = [];
    const ui = createEquipmentUI({
      grid,
      onQuickUnequip: (slot) => calls.push(slot),
    });

    ui.setEquipment({
      weapon: { kind: 'weapon_training_sword', name: 'Training Sword', count: 1 },
      offhand: null,
      head: null,
      chest: null,
      legs: null,
      feet: null,
    });

    const weaponSlot = grid.children.find((child) => child?.dataset?.slot === 'weapon');
    weaponSlot.listeners.dblclick({
      currentTarget: weaponSlot,
    });
    expect(calls).toEqual(['weapon']);
  });
});
