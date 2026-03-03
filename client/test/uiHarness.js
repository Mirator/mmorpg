import { FakeElement, createFakeDocument } from './fakeDom.js';

function findByClass(root, className) {
  return root?.querySelector?.(`.${className}`) ?? null;
}

export function installUiTestGlobals(options = {}) {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  const { document } = createFakeDocument();
  const listeners = {};
  const window = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener(type, handler) {
      if (listeners[type] === handler) delete listeners[type];
    },
    dispatchPointerUp(payload) {
      listeners.pointerup?.(payload);
    },
    listeners,
  };
  const localStorage = {
    getItem: options.localStorage?.getItem ?? (() => null),
    setItem: options.localStorage?.setItem ?? (() => {}),
    removeItem: options.localStorage?.removeItem ?? (() => {}),
  };

  global.document = document;
  global.window = window;
  global.localStorage = localStorage;

  return {
    document,
    window,
    restore() {
      global.document = originalDocument;
      global.window = originalWindow;
      global.localStorage = originalLocalStorage;
    },
  };
}

export function buildAbilityBarRoot() {
  return new FakeElement('div');
}

export function getAbilitySlot(root, slotNumber) {
  const slot = (root?.querySelectorAll?.('.ability-slot') ?? []).find(
    (entry) => entry?.dataset?.slot === String(slotNumber)
  );
  if (!slot) {
    throw new Error(`Missing ability slot ${slotNumber}`);
  }
  return slot;
}

export function getAbilitySlotParts(root, slotNumber) {
  const slot = getAbilitySlot(root, slotNumber);
  return {
    slot,
    keybind: findByClass(slot, 'ability-key'),
    icon: findByClass(slot, 'ability-icon'),
    name: findByClass(slot, 'ability-name'),
    cooldown: findByClass(slot, 'ability-cooldown-num'),
    tooltip: findByClass(slot, 'ability-tooltip'),
  };
}

export function getTooltipParts(root, slotNumber) {
  const { tooltip } = getAbilitySlotParts(root, slotNumber);
  return {
    tooltip,
    title: findByClass(tooltip, 'ability-tooltip-title'),
    summary: findByClass(tooltip, 'ability-tooltip-body'),
    meta: findByClass(tooltip, 'ability-tooltip-meta'),
  };
}

export function getLoadoutSlot(root, slotNumber) {
  const slot = (root?.querySelectorAll?.('.skills-loadout-slot') ?? []).find(
    (entry) => entry?.dataset?.slot === String(slotNumber)
  );
  if (!slot) {
    throw new Error(`Missing loadout slot ${slotNumber}`);
  }
  return slot;
}

export function completePointerDrag(windowObj, payload) {
  windowObj?.dispatchPointerUp?.(payload);
}
