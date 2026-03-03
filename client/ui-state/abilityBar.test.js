import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAbilityPresentation } from '/shared/abilityPresentation.js';
import { createAbilityBar } from './abilityBar.js';
import { buildAbilityPanelState, buildPlayer } from '../test/factories.js';
import {
  buildAbilityBarRoot,
  getAbilitySlot,
  getAbilitySlotParts,
  getTooltipParts,
  installUiTestGlobals,
} from '../test/uiHarness.js';

describe('ability bar rendering', () => {
  let ui;

  beforeEach(() => {
    ui = installUiTestGlobals();
  });

  afterEach(() => {
    ui.restore();
  });

  it('renders learned ability theme and tooltip metadata', () => {
    const abilityBarEl = buildAbilityBarRoot();
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = buildPlayer({
      classId: 'mage',
      level: 3,
      abilityCooldowns: {
        frost_nova: 6500,
      },
    });
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack', 'frost_nova'],
    });
    const slotTwoAbility = loadoutState.slottedAbilities[1];
    const slotTwoPresentation = getAbilityPresentation(slotTwoAbility, {
      classId: loadoutState.classId,
      weaponDef: loadoutState.weaponDef,
    });

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 6000, loadoutState, 900);

    const { slot, keybind, icon, name, cooldown } = getAbilitySlotParts(abilityBarEl, 2);
    const { title, summary, meta } = getTooltipParts(abilityBarEl, 2);
    expect(slotTwoAbility).toBeTruthy();
    expect(keybind?.textContent).toBe('2');
    expect(icon?.className).toContain('ability-icon');
    expect(icon?.style.values['--ui-glyph-mask']).toContain('/assets/ui/icons/game-icons/');
    expect(name?.textContent).toBe(slotTwoAbility?.name ?? '');
    expect(cooldown?.textContent).toBe('0.5s');
    expect(title?.textContent).toBe(slotTwoAbility?.name ?? '');
    expect(summary?.textContent).toBe(slotTwoPresentation.summary);
    expect(meta?.textContent).toBe(slotTwoPresentation.metaLabel);
    expect(meta?.textContent).toContain(slotTwoPresentation.costLabel);
    expect(slot.style.values['--ability-primary-rgb']).toBe(slotTwoPresentation.primaryRgb);
  });

  it('starts slot drag instead of casting in layout edit mode', () => {
    const abilityBarEl = buildAbilityBarRoot();
    let clickedSlot = null;
    const dragStarts = [];
    const abilityBar = createAbilityBar(
      abilityBarEl,
      (slot) => {
        clickedSlot = slot;
      },
      {
        isLayoutEditMode: () => true,
        onStartSlotLayoutDrag: (slot, sourceEl, event) => {
          dragStarts.push({ slot, sourceEl, event });
        },
      }
    );
    const me = buildPlayer();
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack'],
    });

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, loadoutState, 900);

    const slotOne = getAbilitySlot(abilityBarEl, 1);
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

  it('keeps empty slots blank without theme residue', () => {
    const abilityBarEl = buildAbilityBarRoot();
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = buildPlayer();
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack', 'guard_stance', 'taunt', 'basic_attack', 'guard_stance', 'taunt', 'basic_attack', 'guard_stance', 'taunt'],
    });

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, loadoutState, 900);

    const { slot, keybind, icon } = getAbilitySlotParts(abilityBarEl, 10);
    const { title, summary, meta } = getTooltipParts(abilityBarEl, 10);
    const { name } = getAbilitySlotParts(abilityBarEl, 10);
    const { cooldown } = getAbilitySlotParts(abilityBarEl, 10);
    expect(slot.classList.contains('empty')).toBe(true);
    expect(keybind?.textContent).toBe('');
    expect(icon?.textContent).toBe('');
    expect(icon?.style.values['--ui-glyph-mask']).toBe('none');
    expect(name?.textContent).toBe('');
    expect(cooldown?.textContent).toBe('');
    expect(title?.textContent).toBe('');
    expect(summary?.textContent).toBe('');
    expect(meta?.textContent).toBe('');
    expect(slot.style.values['--ability-primary-rgb']).toBeUndefined();
  });

  it('marks abilities unusable without target or sufficient resource', () => {
    const abilityBarEl = buildAbilityBarRoot();
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = buildPlayer({
      classId: 'mage',
      level: 3,
      resource: 10,
    });
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack', 'frost_nova'],
    });

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, loadoutState, 900, null);

    expect(getAbilitySlot(abilityBarEl, 1).classList.contains('unusable')).toBe(true);
    expect(getAbilitySlot(abilityBarEl, 2).classList.contains('unusable')).toBe(true);

    abilityBar.updateAbilityBar(
      { ...me, resource: 100 },
      1000,
      loadoutState,
      900,
      {
        kind: 'mob',
        pos: { x: 2, z: 1 },
      }
    );

    expect(getAbilitySlot(abilityBarEl, 1).classList.contains('unusable')).toBe(false);
    expect(getAbilitySlot(abilityBarEl, 2).classList.contains('unusable')).toBe(false);
  });

  it('keeps click-to-cast active outside layout edit mode', () => {
    const abilityBarEl = buildAbilityBarRoot();
    const clickedSlots = [];
    let dragStarts = 0;
    const abilityBar = createAbilityBar(
      abilityBarEl,
      (slot) => {
        clickedSlots.push(slot);
      },
      {
        isLayoutEditMode: () => false,
        onStartSlotLayoutDrag: () => {
          dragStarts += 1;
        },
      }
    );
    const me = buildPlayer();
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack'],
    });

    abilityBar.buildAbilityBar();
    abilityBar.updateAbilityBar(me, 1000, loadoutState, 900);

    const slotOne = getAbilitySlot(abilityBarEl, 1);
    slotOne.listeners.pointerdown({
      preventDefault() {
        throw new Error('pointerdown should not be prevented outside layout edit mode');
      },
    });
    slotOne.listeners.click();

    expect(dragStarts).toBe(0);
    expect(clickedSlots).toEqual([1]);
  });

  it('tolerates missing persisted loadout without throwing', () => {
    ui.restore();
    ui = installUiTestGlobals({
      localStorage: {
        getItem() {
          return '{';
        },
      },
    });
    const abilityBarEl = buildAbilityBarRoot();
    const abilityBar = createAbilityBar(abilityBarEl, () => {});
    const me = buildPlayer();
    const loadoutState = buildAbilityPanelState({
      classId: me.classId,
      level: me.level,
      equipment: me.equipment,
      slottedIds: ['basic_attack'],
    });

    abilityBar.buildAbilityBar();
    expect(() => abilityBar.updateAbilityBar(me, 1000, loadoutState, 900)).not.toThrow();
    expect(getAbilitySlotParts(abilityBarEl, 1).keybind?.textContent).toBe('1');
  });
});
