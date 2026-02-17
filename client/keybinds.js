const STORAGE_KEY = 'mmorpg_keybinds';

export const DEFAULT_KEYBINDS = {
  moveForward: 'w',
  moveBack: 's',
  moveLeft: 'a',
  moveRight: 'd',
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

export function setKeybind(action, key) {
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

export function getKeyForAction(action) {
  return getKeybinds()[action] ?? DEFAULT_KEYBINDS[action];
}

function eventToKeyString(event) {
  const key = (event.key ?? '').toLowerCase();
  if (key === 'escape' || key === 'esc') return 'Escape';
  if (key === 'tab') return 'Tab';
  const digitMatch = (event.code ?? '').match(/^(Digit|Numpad)(\d)$/i);
  if (digitMatch) return digitMatch[2];
  if (key.length === 1) return key;
  return key;
}

export function isKeyMatch(event, action) {
  const bound = (getKeyForAction(action) ?? '').toLowerCase();
  const eventKey = eventToKeyString(event).toLowerCase();
  if (bound === 'escape' && (eventKey === 'escape' || eventKey === 'esc')) return true;
  if (bound === eventKey) return true;
  if (bound.length === 1 && eventKey.length === 1 && bound === eventKey) return true;
  return false;
}

export function getAbilitySlotFromEvent(event) {
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
