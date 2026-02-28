// @ts-check
const STORAGE_KEY = 'mmorpg_keybinds';

export const /** @type {any} */ DEFAULT_KEYBINDS = {
  moveForward: 'w',
  moveBack: 's',
  moveLeft: 'a',
  moveRight: 'd',
  toggleWalk: 'CapsLock',
  interact: 'e',
  inventory: 'i',
  character: 'c',
  skills: 'k',
  fullscreen: 'f',
  pause: 'Escape',
  cycleTarget: 'Tab',
  tradeBuy: 'b',
  tradeSell: 's',
  ability1: '1',
  ability2: '2',
  ability3: '3',
  ability4: '4',
  ability5: '5',
  ability6: '6',
  ability7: '7',
  ability8: '8',
  ability9: '9',
  ability10: '0',
};

export function getKeybinds() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_KEYBINDS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_KEYBINDS };
}

export function setKeybind(/** @type {any} */ action, /** @type {any} */ key) {
  const keybinds = getKeybinds();
  keybinds[action] = key;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keybinds));
  } catch {
    /* ignore */
  }
  return keybinds;
}

export function resetKeybinds() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_KEYBINDS };
}

export function getKeyForAction(/** @type {any} */ action) {
  return getKeybinds()[action] ?? DEFAULT_KEYBINDS[action];
}

export function normalizeKeyString(/** @type {any} */ value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'escape' || lower === 'esc') return 'Escape';
  if (lower === 'tab') return 'Tab';
  if (lower === 'capslock' || lower === 'caps lock') return 'CapsLock';
  if (trimmed.length === 1) return lower;
  return trimmed;
}

function eventToKeyString(/** @type {any} */ event) {
  const digitMatch = (event.code ?? '').match(/^(Digit|Numpad)(\d)$/i);
  if (digitMatch) return digitMatch[2];
  return normalizeKeyString(event.key ?? '');
}

export function isKeyMatch(/** @type {any} */ event, /** @type {any} */ action) {
  const bound = normalizeKeyString(getKeyForAction(action));
  const eventKey = eventToKeyString(event);
  return !!bound && !!eventKey && bound.toLowerCase() === eventKey.toLowerCase();
}

export function getAbilitySlotFromEvent(/** @type {any} */ event) {
  const keybinds = getKeybinds();
  const eventKey = eventToKeyString(event);
  for (let slot = 1; slot <= 10; slot++) {
    const bound = keybinds[`ability${slot}`] ?? DEFAULT_KEYBINDS[`ability${slot}`];
    const boundNorm = (bound ?? '').toLowerCase();
    const eventNorm = eventKey.toLowerCase();
    if (boundNorm === eventNorm) return slot;
    if (bound === '0' && (event.key === '0' || eventKey === '0')) return 10;
  }
  const digitMatch = (event.code ?? '').match(/^(Digit|Numpad)(\d)$/i);
  if (digitMatch) {
    const d = Number(digitMatch[2]);
    return d === 0 ? 10 : d;
  }
  if ((event.key ?? '') >= '0' && (event.key ?? '') <= '9') {
    const d = Number(event.key);
    return d === 0 ? 10 : d;
  }
  return null;
}
