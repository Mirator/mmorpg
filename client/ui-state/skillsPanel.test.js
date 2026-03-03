import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSkillsPanelUpdater } from './skillsPanel.js';
import { buildAbilityPanelState, buildPlayer } from '../test/factories.js';
import {
  completePointerDrag,
  getLoadoutSlot,
  installUiTestGlobals,
} from '../test/uiHarness.js';

function findSkillRow(/** @type {any} */ root, /** @type {string} */ name) {
  return (
    root
      .querySelectorAll('.skill-row')
      .find(
        (/** @type {any} */ row) => row.querySelector('.skill-name')?.textContent === name
      ) ?? null
  );
}

function createPanelHarness(ui, options = {}) {
  const skillsListEl = global.document.createElement('div');
  const skillsClassEl = global.document.createElement('div');
  const skillsLevelEl = global.document.createElement('div');
  const skillsXpEl = global.document.createElement('div');
  const me = buildPlayer({
    classId: 'mage',
    level: 3,
    xp: 12,
    xpToNext: 25,
  });
  const baseState = buildAbilityPanelState({
    classId: me.classId,
    level: me.level,
    equipment: me.equipment,
    slottedIds: options.slottedIds ?? ['basic_attack', 'frost_nova'],
  });
  const abilities = baseState.abilities;
  const basicAttack = baseState.slottedAbilities[0];
  const frostNova = baseState.slottedAbilities[1];
  let panelState = baseState;
  let loadoutChangedCount = 0;

  function syncSignature() {
    panelState = {
      ...panelState,
      loadoutSignature: panelState.slottedAbilities
        .map((ability) => ability?.id ?? '-')
        .join('|'),
    };
  }

  const skillsPanelModule = createSkillsPanelUpdater({
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
    onLoadoutChanged: () => {
      loadoutChangedCount += 1;
    },
  });

  return {
    skillsListEl,
    skillsClassEl,
    skillsLevelEl,
    skillsXpEl,
    skillsPanelModule,
    me,
    basicAttack,
    frostNova,
    getPanelState: () => panelState,
    getLoadoutChangedCount: () => loadoutChangedCount,
    completeDrop(payload) {
      completePointerDrag(ui.window, payload);
    },
  };
}

describe('skills panel rendering', () => {
  let ui;

  beforeEach(() => {
    ui = installUiTestGlobals();
  });

  afterEach(() => {
    ui.restore();
  });

  it('renders loadout editor with class and xp summary', () => {
    const {
      skillsListEl,
      skillsClassEl,
      skillsLevelEl,
      skillsXpEl,
      skillsPanelModule,
      me,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const loadout = skillsListEl.querySelector('.skills-loadout');
    const thirdSlot = getLoadoutSlot(skillsListEl, 3);
    const fireboltRow = findSkillRow(skillsListEl, 'Firebolt');

    expect(skillsClassEl.textContent).toBe('Mage');
    expect(skillsLevelEl.textContent).toBe('3');
    expect(skillsXpEl.textContent).toBe('12/25');
    expect(loadout).toBeTruthy();
    expect(skillsListEl.querySelectorAll('.skills-loadout-slot')).toHaveLength(10);
    expect(thirdSlot.classList.contains('empty')).toBe(true);
    expect(fireboltRow?.querySelector('.skill-meta')?.textContent).toContain('Off bar');
    expect(fireboltRow?.querySelector('.skill-tooltip-meta')?.textContent).toContain('40 Mana');
    expect(typeof fireboltRow?.listeners?.pointerdown).toBe('function');
  });

  it('drags a skill row onto an empty loadout slot', () => {
    const {
      skillsListEl,
      skillsPanelModule,
      me,
      getLoadoutChangedCount,
      completeDrop,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const targetSlot = getLoadoutSlot(skillsListEl, 3);
    const fireboltRow = findSkillRow(skillsListEl, 'Firebolt');

    global.document.elementFromPoint = () => targetSlot;
    fireboltRow?.listeners?.pointerdown({
      preventDefault() {},
      clientX: 24,
      clientY: 24,
    });
    completeDrop({
      clientX: 24,
      clientY: 24,
    });

    const updatedSlot = getLoadoutSlot(skillsListEl, 3);
    const updatedFireboltRow = findSkillRow(skillsListEl, 'Firebolt');
    expect(updatedSlot.classList.contains('empty')).toBe(false);
    expect(updatedSlot.querySelector('.skills-loadout-name')?.textContent).toBe('Firebolt');
    expect(updatedFireboltRow?.querySelector('.skill-meta')?.textContent).toContain('Bar 3');
    expect(getLoadoutChangedCount()).toBe(1);
  });

  it('moves a live HUD slot onto another HUD slot', () => {
    const {
      skillsListEl,
      skillsPanelModule,
      me,
      frostNova,
      getPanelState,
      getLoadoutChangedCount,
      completeDrop,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const sourceBarSlot = global.document.createElement('div');
    sourceBarSlot.className = 'ability-slot';
    sourceBarSlot.dataset.slot = '2';
    const targetBarSlot = global.document.createElement('div');
    targetBarSlot.className = 'ability-slot';
    targetBarSlot.dataset.slot = '3';

    global.document.elementFromPoint = () => targetBarSlot;
    const started = skillsPanelModule.startBarSlotDrag(me, 2, sourceBarSlot, {
      preventDefault() {},
      clientX: 36,
      clientY: 18,
    });
    completeDrop({
      clientX: 36,
      clientY: 18,
    });

    const updatedSlot = getLoadoutSlot(skillsListEl, 3);
    const updatedFrostNovaRow = findSkillRow(skillsListEl, 'Frost Nova');

    expect(started).toBe(true);
    expect(getPanelState().slottedAbilities[1]).toBeNull();
    expect(getPanelState().slottedAbilities[2]?.id).toBe(frostNova?.id ?? null);
    expect(updatedSlot.querySelector('.skills-loadout-name')?.textContent).toBe('Frost Nova');
    expect(updatedFrostNovaRow?.querySelector('.skill-meta')?.textContent).toContain('Bar 3');
    expect(getLoadoutChangedCount()).toBe(1);
  });

  it('drops a live HUD slot into the remove zone', () => {
    const {
      skillsListEl,
      skillsPanelModule,
      me,
      basicAttack,
      getPanelState,
      getLoadoutChangedCount,
      completeDrop,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const removeTarget = skillsListEl.querySelector('.skills-loadout-remove');
    const sourceBarSlot = global.document.createElement('div');
    sourceBarSlot.className = 'ability-slot';
    sourceBarSlot.dataset.slot = '1';

    global.document.elementFromPoint = () => removeTarget;
    const started = skillsPanelModule.startBarSlotDrag(me, 1, sourceBarSlot, {
      preventDefault() {},
      clientX: 28,
      clientY: 44,
    });
    completeDrop({
      clientX: 28,
      clientY: 44,
    });

    const updatedBasicAttackRow = findSkillRow(skillsListEl, basicAttack?.name ?? 'Basic Attack');

    expect(started).toBe(true);
    expect(getPanelState().slottedAbilities[0]).toBeNull();
    expect(getPanelState().slottedAbilities[1]?.id).toBe('frost_nova');
    expect(getLoadoutSlot(skillsListEl, 1).classList.contains('empty')).toBe(true);
    expect(updatedBasicAttackRow?.querySelector('.skill-meta')?.textContent).toContain('Off bar');
    expect(getLoadoutChangedCount()).toBe(1);
  });

  it('ignores pointer release on invalid drop targets', () => {
    const {
      skillsListEl,
      skillsPanelModule,
      me,
      getPanelState,
      getLoadoutChangedCount,
      completeDrop,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const beforeSignature = getPanelState().loadoutSignature;
    const fireboltRow = findSkillRow(skillsListEl, 'Firebolt');
    global.document.elementFromPoint = () => global.document.createElement('div');

    fireboltRow?.listeners?.pointerdown({
      preventDefault() {},
      clientX: 12,
      clientY: 18,
    });
    completeDrop({
      clientX: 12,
      clientY: 18,
    });

    expect(getPanelState().loadoutSignature).toBe(beforeSignature);
    expect(getLoadoutChangedCount()).toBe(0);
  });

  it('emits loadout changed exactly once per successful drop', () => {
    const {
      skillsListEl,
      skillsPanelModule,
      me,
      getLoadoutChangedCount,
      completeDrop,
    } = createPanelHarness(ui);

    skillsPanelModule.update(me);

    const targetSlot = getLoadoutSlot(skillsListEl, 4);
    const fireboltRow = findSkillRow(skillsListEl, 'Firebolt');
    global.document.elementFromPoint = () => targetSlot;

    fireboltRow?.listeners?.pointerdown({
      preventDefault() {},
      clientX: 20,
      clientY: 20,
    });
    completeDrop({
      clientX: 20,
      clientY: 20,
    });

    expect(getLoadoutChangedCount()).toBe(1);
  });
});
