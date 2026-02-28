import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCraftingUI } from './crafting.js';
import { FakeElement } from './test/fakeDom.js';

describe('crafting recipe rendering', () => {
  const originalDocument = global.document;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it('renders output and ingredient glyphs for mapped item kinds', () => {
    const recipeListEl = new FakeElement('div');
    const ui = createCraftingUI({
      recipeListEl,
      inventory: [{ kind: 'herb', count: 3 }, { kind: 'crystal', count: 1 }],
      recipes: [
        {
          id: 'herb_health_potion',
          name: 'Minor Health Potion',
          inputs: [{ kind: 'herb', count: 2 }],
          output: { kind: 'consumable_minor_health_potion', count: 1 },
        },
      ],
    });

    ui.render();

    const row = recipeListEl.children[0];
    const header = row.children[0];
    expect(header.children[0].className).toContain('craft-recipe-glyph');
    expect(header.children[0].style.values['--ui-glyph-mask']).toContain('lorc/heart-bottle.svg');

    const ingredients = row.children[1];
    expect(ingredients.children[0].children[0].className).toContain('craft-ingredient-glyph');
    expect(ingredients.children[0].children[0].style.values['--ui-glyph-mask']).toContain(
      'lorc/lotus-flower.svg'
    );
  });
});
