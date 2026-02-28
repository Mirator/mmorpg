import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSkillsPanelUpdater } from './skillsPanel.js';
import { FakeElement } from '../test/fakeDom.js';

describe('skills panel rendering', () => {
  const originalDocument = global.document;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
  });

  afterEach(() => {
    global.document = originalDocument;
  });

  it('renders themed skill rows with matching tooltip content', () => {
    const skillsListEl = new FakeElement('div');
    const skillsClassEl = new FakeElement('div');
    const skillsLevelEl = new FakeElement('div');
    const skillsXpEl = new FakeElement('div');
    const updateSkillsPanel = createSkillsPanelUpdater({
      skillsListEl,
      skillsClassEl,
      skillsLevelEl,
      skillsXpEl,
    });

    updateSkillsPanel(
      {
        classId: 'mage',
        level: 3,
        equipment: {},
        xp: 12,
        xpToNext: 25,
      },
      (player) => player?.classId ?? null
    );

    const fireboltRow = skillsListEl.children[1];
    const tooltip = fireboltRow.querySelector('.skill-tooltip');

    expect(skillsClassEl.textContent).toBe('Mage');
    expect(skillsLevelEl.textContent).toBe('3');
    expect(skillsXpEl.textContent).toBe('12/25');
    expect(fireboltRow.style.values['--ability-primary-rgb']).toBe('255, 102, 51');
    expect(fireboltRow.style.values['--ability-secondary-rgb']).toBe('255, 176, 102');
    expect(fireboltRow.querySelector('.skill-name')?.textContent).toBe('Firebolt');
    expect(fireboltRow.querySelector('.skill-meta')?.textContent).toContain('Slot 2');
    expect(tooltip?.children[0].textContent).toBe('Firebolt');
    expect(tooltip?.children[1].textContent).toContain('chilled targets');
    expect(tooltip?.children[2].textContent).toContain('40 Mana');
  });
});
