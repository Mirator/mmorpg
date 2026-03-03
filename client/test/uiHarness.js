// @ts-check
import { FakeElement, createFakeDocument } from './fakeDom.js';

/**
 * @param {any} root
 * @param {string} className
 */
function findByClass(root, className) {
  return root?.querySelector?.(`.${className}`) ?? null;
}

/**
 * @param {{
 *   localStorage?: {
 *     getItem?: (key: string) => string | null;
 *     setItem?: (key: string, value: string) => void;
 *     removeItem?: (key: string) => void;
 *   };
 * }} [options]
 */
export function installUiTestGlobals(options = {}) {
  const globalObj = /** @type {any} */ (globalThis);
  const originalDocument = globalObj.document;
  const originalWindow = globalObj.window;
  const originalLocalStorage = globalObj.localStorage;

  const { document } = createFakeDocument();
  const listeners = /** @type {Record<string, ((payload?: any) => void) | undefined>} */ ({});
  const window = {
    /**
     * @param {string} type
     * @param {(payload?: any) => void} handler
     */
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    /**
     * @param {string} type
     * @param {(payload?: any) => void} handler
     */
    removeEventListener(type, handler) {
      if (listeners[type] === handler) delete listeners[type];
    },
    /**
     * @param {any} payload
     */
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

  globalObj.document = document;
  globalObj.window = window;
  globalObj.localStorage = localStorage;

  return {
    document,
    window,
    restore() {
      globalObj.document = originalDocument;
      globalObj.window = originalWindow;
      globalObj.localStorage = originalLocalStorage;
    },
  };
}

export function buildAbilityBarRoot() {
  return new FakeElement('div');
}

/**
 * @param {any} root
 * @param {number} slotNumber
 */
export function getAbilitySlot(root, slotNumber) {
  const slot = (root?.querySelectorAll?.('.ability-slot') ?? []).find(
    (/** @type {any} */ entry) => entry?.dataset?.slot === String(slotNumber)
  );
  if (!slot) {
    throw new Error(`Missing ability slot ${slotNumber}`);
  }
  return slot;
}

/**
 * @param {any} root
 * @param {number} slotNumber
 */
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

/**
 * @param {any} root
 * @param {number} slotNumber
 */
export function getTooltipParts(root, slotNumber) {
  const { tooltip } = getAbilitySlotParts(root, slotNumber);
  return {
    tooltip,
    title: findByClass(tooltip, 'ability-tooltip-title'),
    summary: findByClass(tooltip, 'ability-tooltip-body'),
    meta: findByClass(tooltip, 'ability-tooltip-meta'),
  };
}

/**
 * @param {any} root
 * @param {number} slotNumber
 */
export function getLoadoutSlot(root, slotNumber) {
  const slot = (root?.querySelectorAll?.('.skills-loadout-slot') ?? []).find(
    (/** @type {any} */ entry) => entry?.dataset?.slot === String(slotNumber)
  );
  if (!slot) {
    throw new Error(`Missing loadout slot ${slotNumber}`);
  }
  return slot;
}

/**
 * @param {any} windowObj
 * @param {any} payload
 */
export function completePointerDrag(windowObj, payload) {
  windowObj?.dispatchPointerUp?.(payload);
}
