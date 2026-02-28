import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAbilitiesForClass } from '/shared/classes.js';
import { getEquippedWeapon } from '/shared/equipment.js';
import { buildAbilityTooltip, createAbilityBar } from './abilityBar.js';
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

  it('renders ability labels, tooltip text, and cooldowns', () => {
    const abilityBarEl = new FakeElement('div');
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = {
      classId: 'fighter',
      level: 1,
      equipment: {},
      globalCooldownUntil: 0,
      attackCooldownUntil: 1600,
      abilityCooldowns: {},
    };
    const classId = me.classId;
    const weaponDef = getEquippedWeapon(me.equipment, classId);
    const slotOneAbility = getAbilitiesForClass(classId, me.level, weaponDef).find((ability) => ability.slot === 1);

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);

    const slotOne = abilityBarEl.children[0];
    expect(slotOneAbility).toBeTruthy();
    expect(slotOne.children[1].className).toContain('ability-icon');
    expect(slotOne.children[1].style.values['--ui-glyph-mask']).toContain('/assets/ui/icons/game-icons/');
    expect(slotOne.children[2].textContent).toBe(slotOneAbility?.name ?? '');
    expect(slotOne.children[3].textContent).toBe('0.6s');
    expect(slotOne.children[4].children[0].textContent).toBe(slotOneAbility?.name ?? '');
    expect(slotOne.children[4].children[1].textContent).toBe(buildAbilityTooltip(slotOneAbility));
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
    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);
    const firstCounts = collectCounters(abilityBarEl);

    abilityBar.updateAbilityBar(me, 1000, (player) => player?.classId ?? null, 900);
    const secondCounts = collectCounters(abilityBarEl);

    expect(secondCounts).toEqual(firstCounts);
  });
});
