import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInventoryUI } from './inventory.js';
import { FakeElement } from './test/fakeDom.js';

describe('inventory item rendering', () => {
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

  it('renders mapped glyphs and falls back to text initials for unknown items', () => {
    const panel = new FakeElement('div');
    const grid = new FakeElement('div');
    const ui = createInventoryUI({
      panel,
      grid,
    });

    ui.setInventory(
      [
        { kind: 'ore', name: 'Iron Ore', count: 2 },
        { kind: 'mystery_box', name: 'Mystery Box', count: 1 },
      ],
      { slots: 2, stackMax: 20 }
    );

    const firstSlot = grid.children[0];
    const firstItem = firstSlot.children[0];
    expect(firstItem.children[0].className).toContain('inventory-item-glyph');
    expect(firstItem.children[0].style.values['--ui-glyph-mask']).toContain('lorc/rock.svg');

    const secondSlot = grid.children[1];
    const secondItem = secondSlot.children[0];
    expect(secondItem.textContent).toBe('M');
  });

  it('emits quick-equip callback on double-click', () => {
    const panel = new FakeElement('div');
    const grid = new FakeElement('div');
    const quickEquipCalls = [];
    const ui = createInventoryUI({
      panel,
      grid,
      onQuickEquip: (slot) => quickEquipCalls.push(slot),
    });

    ui.setOpen(true);
    ui.setInventory([{ kind: 'weapon_training_sword', name: 'Training Sword', count: 1 }], {
      slots: 1,
      stackMax: 20,
    });

    const firstSlot = grid.children[0];
    firstSlot.listeners.dblclick({
      currentTarget: firstSlot,
    });

    expect(quickEquipCalls).toEqual([0]);
  });

  it('renders comparison details in tooltip for equippable items', () => {
    const panel = new FakeElement('div');
    const grid = new FakeElement('div');
    const ui = createInventoryUI({
      panel,
      grid,
      getEquipmentState: () => ({
        weapon: { kind: 'weapon_training_sword', name: 'Training Sword', count: 1 },
        offhand: null,
        head: null,
        chest: null,
        legs: null,
        feet: null,
      }),
    });

    ui.setOpen(true);
    ui.setInventory(
      [{ kind: 'weapon_iron_blade', name: 'Iron Blade', count: 1 }],
      { slots: 1, stackMax: 20 }
    );

    const compareRow = grid.querySelector('.item-tooltip-compare');
    expect(compareRow).toBeTruthy();
    expect(compareRow.textContent).toContain('+');
  });
});
