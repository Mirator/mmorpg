import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAbilitiesForClass } from '/shared/classes.js';
import { getAbilityPresentation } from '/shared/abilityPresentation.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { createAbilityBar } from './abilityBar.js';
import { collectCounters, FakeElement } from '../test/fakeDom.js';

describe('ability bar rendering', () => {
  const originalDocument = global.document;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    global.document = {
      createElement: (tagName) => new FakeElement(tagName),
    };
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.localStorage = originalLocalStorage;
  });

  it('renders themed tooltip text, costs, and cooldowns for learned skills', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'mage',
      level: 3,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {
        frost_nova: 6500,
      },
    };
    const classId = me.classId;
    const weaponDef = getEquippedWeapon(me.equipment, classId);
    const abilities = getAbilitiesForClass(classId, me.level, weaponDef);
    const slotTwoAbility = abilities.find((ability) => ability.id === 'frost_nova');
    const slotTwoPresentation = getAbilityPresentation(slotTwoAbility, { classId, weaponDef });
    const slottedAbilities = Array.from({ length: 10 }, () => null);
    slottedAbilities[0] = abilities.find((ability) => ability.id === 'basic_attack') ?? null;
    slottedAbilities[1] = slotTwoAbility ?? null;

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 6000, { classId, weaponDef, slottedAbilities }, 900);

    const slotTwo = abilityBarEl.children[1];
    expect(slotTwoAbility).toBeTruthy();
    expect(slotTwo.children[0].textContent).toBe('2');
    expect(slotTwo.children[1].className).toContain('ability-icon');
    expect(slotTwo.children[1].style.values['--ui-glyph-mask']).toContain('/assets/ui/icons/game-icons/');
    expect(slotTwo.children[2].textContent).toBe(slotTwoAbility?.name ?? '');
    expect(slotTwo.children[3].textContent).toBe('0.5s');
    expect(slotTwo.children[4].children[0].textContent).toBe(slotTwoAbility?.name ?? '');
    expect(slotTwo.children[4].children[1].textContent).toBe(slotTwoPresentation.summary);
    expect(slotTwo.children[4].children[2].textContent).toBe(slotTwoPresentation.metaLabel);
    expect(slotTwo.children[4].children[2].textContent).toContain(slotTwoPresentation.costLabel);
    expect(slotTwo.style.values['--ability-primary-rgb']).toBe(slotTwoPresentation.primaryRgb);
  });

  it('starts layout dragging instead of casting while the skills tab is in layout edit mode', () => {
    const abilityBarEl = new FakeElement('div');
    let clickedSlot = null;
    const dragStarts = [];
    const abilityBar = createAbilityBar(abilityBarEl, (slot) => {
      clickedSlot = slot;
    }, {
      isLayoutEditMode: () => true,
      onStartSlotLayoutDrag: (slot, sourceEl, event) => {
        dragStarts.push({ slot, sourceEl, event });
      },
    });
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
    };
    const weaponDef = getEquippedWeapon(me.equipment, me.classId);
    const abilities = getAbilitiesForClass(me.classId, me.level, weaponDef);
    const slottedAbilities = Array.from({ length: 10 }, () => null);
    slottedAbilities[0] = abilities[0] ?? null;

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, { classId: me.classId, weaponDef, slottedAbilities }, 900);

    const slotOne = abilityBarEl.children[0];
    let prevented = false;
    const event = {
      preventDefault() {
        prevented = true;
      },
      clientX: 18,
      clientY: 22,
    };

    slotOne.listeners.pointerdown(event);
    slotOne.listeners.click();

    expect(prevented).toBe(true);
    expect(clickedSlot).toBeNull();
    expect(dragStarts).toHaveLength(1);
    expect(dragStarts[0]).toEqual({ slot: 1, sourceEl: slotOne, event });
  });

  it('keeps empty slots visually blank while preserving the fixed layout', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
    };

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, {
      classId: me.classId,
      weaponDef: getEquippedWeapon(me.equipment, me.classId),
      slottedAbilities: getAbilitiesForClass(me.classId, me.level, getEquippedWeapon(me.equipment, me.classId))
        .slice(0, 9)
        .concat(null),
    }, 900);

    const emptySlot = abilityBarEl.children[9];
    expect(emptySlot.classList.contains('empty')).toBe(true);
    expect(emptySlot.children[0].textContent).toBe('');
    expect(emptySlot.children[1].textContent).toBe('');
    expect(emptySlot.children[1].style.values['--ui-glyph-mask']).toBe('none');
    expect(emptySlot.children[4].children[0].textContent).toBe('');
    expect(emptySlot.children[4].children[1].textContent).toBe('');
    expect(emptySlot.children[4].children[2].textContent).toBe('');
    expect(emptySlot.style.values['--ability-primary-rgb']).toBeUndefined();
  });

  it('marks abilities unusable when a required target or resource is missing', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'mage',
      level: 3,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
      resource: 10,
      x: 0,
      z: 0,
    };

    abilityBar.buildAbilityBar();
    const weaponDef = getEquippedWeapon(me.equipment, me.classId);
    const abilities = getAbilitiesForClass(me.classId, me.level, weaponDef);
    const slottedAbilities = Array.from({ length: 10 }, () => null);
    slottedAbilities[0] = abilities.find((ability) => ability.id === 'basic_attack') ?? null;
    slottedAbilities[1] = abilities.find((ability) => ability.id === 'frost_nova') ?? null;

    abilityBar.updateAbilityBar(me, 1000, { classId: me.classId, weaponDef, slottedAbilities }, 900, null);

    expect(abilityBarEl.children[0].classList.contains('unusable')).toBe(true);
    expect(abilityBarEl.children[1].classList.contains('unusable')).toBe(true);

    abilityBar.updateAbilityBar(
      { ...me, resource: 100 },
      1000,
      { classId: me.classId, weaponDef, slottedAbilities },
      900,
      {
        kind: 'mob',
        pos: { x: 2, z: 1 },
      }
    );

    expect(abilityBarEl.children[0].classList.contains('unusable')).toBe(false);
    expect(abilityBarEl.children[1].classList.contains('unusable')).toBe(false);
  });

  it('keeps ability clicks active outside layout edit mode', () => {
    const abilityBarEl = new FakeElement('div');
    const clickedSlots = [];
    let dragStarts = 0;
    const abilityBar = createAbilityBar(abilityBarEl, (slot) => {
      clickedSlots.push(slot);
    }, {
      isLayoutEditMode: () => false,
      onStartSlotLayoutDrag: () => {
        dragStarts += 1;
      },
    });
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
    };
    const weaponDef = getEquippedWeapon(me.equipment, me.classId);
    const abilities = getAbilitiesForClass(me.classId, me.level, weaponDef);
    const slottedAbilities = Array.from({ length: 10 }, () => null);
    slottedAbilities[0] = abilities[0] ?? null;

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, { classId: me.classId, weaponDef, slottedAbilities }, 900);

    const slotOne = abilityBarEl.children[0];
    slotOne.listeners.pointerdown({
      preventDefault() {
        throw new Error('pointerdown should not be prevented outside layout edit mode');
      },
    });
    slotOne.listeners.click();

    expect(dragStarts).toBe(0);
    expect(clickedSlots).toEqual([1]);
  });

  it('skips DOM writes on repeated identical updates', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 0,
      abilityCooldowns: {},
    };

    abilityBar.buildAbilityBar();
    const weaponDef = getEquippedWeapon(me.equipment, me.classId);
    const abilities = getAbilitiesForClass(me.classId, me.level, weaponDef);
    const slottedAbilities = Array.from({ length: 10 }, () => null);
    slottedAbilities[0] = abilities[0] ?? null;
    abilityBar.updateAbilityBar(me, 1000, { classId: me.classId, weaponDef, slottedAbilities }, 900);
    const firstCounts = collectCounters(abilityBarEl);

    abilityBar.updateAbilityBar(me, 1000, { classId: me.classId, weaponDef, slottedAbilities }, 900);
    const secondCounts = collectCounters(abilityBarEl);

    expect(secondCounts).toEqual(firstCounts);
  });
});
