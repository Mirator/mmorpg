import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { createSkillsPanelUpdater } from './skillsPanel.js';
import { createFakeDocument } from '../test/fakeDom.js';

function findSkillRow(/** @type {any} */ root, /** @type {string} */ name) {
  return (
    root
      .querySelectorAll('.skill-row')
      .find(
        (/** @type {any} */ row) => row.querySelector('.skill-name')?.textContent === name
      ) ?? null
  );
}

describe('skills panel rendering', () => {
  const originalDocument = global.document;
  const originalWindow = global.window;

  beforeEach(() => {
    const { document } = createFakeDocument();
    global.document = document;
    const listeners = {};
    global.window = {
      addEventListener(type, handler) {
        listeners[type] = handler;
      },
      removeEventListener(type, handler) {
        if (listeners[type] === handler) delete listeners[type];
      },
      listeners,
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
  });

  it('renders a loadout editor and supports dragging a skill onto the bar', () => {
    const skillsListEl = global.document.createElement('div');
    const skillsClassEl = global.document.createElement('div');
    const skillsLevelEl = global.document.createElement('div');
    const skillsXpEl = global.document.createElement('div');
    const me = {
      classId: 'mage',
      level: 3,
      equipment: {},
      xp: 12,
      xpToNext: 25,
    };
    const classId = me.classId;
    const weaponDef = getEquippedWeapon(me.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me.level, weaponDef);
    const basicAttack = abilities.find((ability) => ability.id === 'basic_attack') ?? null;
    const frostNova = abilities.find((ability) => ability.id === 'frost_nova') ?? null;
    let panelState = {
      classId,
      weaponDef,
      abilities,
      slottedAbilities: [basicAttack, frostNova, null, null, null, null, null, null, null, null],
      loadoutSignature: 'basic_attack|frost_nova|-|-|-|-|-|-|-|-',
    };

    function syncSignature() {
      panelState = {
        ...panelState,
        loadoutSignature: panelState.slottedAbilities
          .map((ability) => ability?.id ?? '-')
          .join('|'),
      };
    }

    const updateSkillsPanel = createSkillsPanelUpdater({
      skillsListEl,
      skillsClassEl,
      skillsLevelEl,
      skillsXpEl,
      getAbilityPanelState: () => panelState,
      setAbilityInSlot: (player, abilityId, slot) => {
        const next = panelState.slottedAbilities.slice();
        const fromIndex = next.findIndex((ability) => ability?.id === abilityId);
        const toIndex = slot - 1;
        const target = abilities.find((ability) => ability.id === abilityId) ?? null;
        const displaced = next[toIndex] ?? null;
        next[toIndex] = target;
        if (fromIndex >= 0) {
          next[fromIndex] = displaced;
        }
        panelState = { ...panelState, slottedAbilities: next };
        syncSignature();
      },
      swapAbilitySlots: (player, fromSlot, toSlot) => {
        const next = panelState.slottedAbilities.slice();
        const fromIndex = fromSlot - 1;
        const toIndex = toSlot - 1;
        const temp = next[fromIndex];
        next[fromIndex] = next[toIndex];
        next[toIndex] = temp;
        panelState = { ...panelState, slottedAbilities: next };
        syncSignature();
      },
      clearAbilitySlot: (player, slot) => {
        const next = panelState.slottedAbilities.slice();
        next[slot - 1] = null;
        panelState = { ...panelState, slottedAbilities: next };
        syncSignature();
      },
    });

    updateSkillsPanel(me);

    const loadout = skillsListEl.querySelector('.skills-loadout');
    const loadoutSlots = skillsListEl.querySelectorAll('.skills-loadout-slot');
    const fireboltRow = findSkillRow(skillsListEl, 'Firebolt');

    expect(skillsClassEl.textContent).toBe('Mage');
    expect(skillsLevelEl.textContent).toBe('3');
    expect(skillsXpEl.textContent).toBe('12/25');
    expect(loadout).toBeTruthy();
    expect(loadoutSlots).toHaveLength(10);
    expect(loadoutSlots[2].classList.contains('empty')).toBe(true);
    expect(fireboltRow?.querySelector('.skill-meta')?.textContent).toContain('Off bar');
    expect(fireboltRow?.querySelector('.skill-tooltip-meta')?.textContent).toContain('40 Mana');
    expect(typeof fireboltRow?.listeners?.pointerdown).toBe('function');

    global.document.elementFromPoint = () => loadoutSlots[2];
    fireboltRow.listeners.pointerdown({
      preventDefault() {},
      clientX: 24,
      clientY: 24,
    });
    global.window.listeners.pointerup({
      clientX: 24,
      clientY: 24,
    });

    const updatedSlots = skillsListEl.querySelectorAll('.skills-loadout-slot');
    const updatedFireboltRow = findSkillRow(skillsListEl, 'Firebolt');
    expect(updatedSlots[2].classList.contains('empty')).toBe(false);
    expect(updatedSlots[2].querySelector('.skills-loadout-name')?.textContent).toBe('Firebolt');
    expect(updatedFireboltRow?.querySelector('.skill-meta')?.textContent).toContain('Bar 3');
  });
});
