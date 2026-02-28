import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInventoryUI } from './inventory.js';
import { FakeElement } from './test/fakeDom.js';

describe('inventory item rendering', () => {
  const originalDocument = global.document;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
  });

  afterEach(() => {
    global.document = originalDocument;
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
});
