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
