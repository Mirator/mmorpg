// @ts-check
import { ABILITY_SLOTS } from '/shared/classes.js';

const STORAGE_KEY_PREFIX = 'mmorpg_ability_loadout_v1';

/** @returns {(string | null)[]} */
function makeEmptySlots() {
  return Array.from({ length: ABILITY_SLOTS }, () => null);
}

function normalizeAbilityId(/** @type {any} */ value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function normalizeSlotIndex(/** @type {any} */ slot) {
  const value = Number(slot);
  if (!Number.isInteger(value) || value < 1 || value > ABILITY_SLOTS) return null;
  return value;
}

function buildKnownIds(/** @type {any[]} */ abilities) {
  const ids = /** @type {string[]} */ ([]);
  const seen = new Set();
  for (const ability of abilities ?? []) {
    const id = normalizeAbilityId(ability?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** @returns {(string | null)[]} */
function normalizeSlots(/** @type {any} */ rawSlots) {
  const slots = makeEmptySlots();
  if (!Array.isArray(rawSlots)) return slots;
  const seen = new Set();
  for (let i = 0; i < ABILITY_SLOTS && i < rawSlots.length; i += 1) {
    const id = normalizeAbilityId(rawSlots[i]);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    slots[i] = id;
  }
  return slots;
}

function hasSameState(/** @type {any} */ a, /** @type {any} */ b) {
  const aSlots = Array.isArray(a?.slots) ? a.slots : [];
  const bSlots = Array.isArray(b?.slots) ? b.slots : [];
  const aKnown = Array.isArray(a?.knownAbilityIds) ? a.knownAbilityIds : [];
  const bKnown = Array.isArray(b?.knownAbilityIds) ? b.knownAbilityIds : [];
  if (aSlots.length !== bSlots.length || aKnown.length !== bKnown.length) return false;
  for (let i = 0; i < aSlots.length; i += 1) {
    if (aSlots[i] !== bSlots[i]) return false;
  }
  for (let i = 0; i < aKnown.length; i += 1) {
    if (aKnown[i] !== bKnown[i]) return false;
  }
  return true;
}

function firstEmptySlot(/** @type {(string | null)[]} */ slots) {
  return slots.findIndex((entry) => entry == null);
}

function buildDefaultSlots(/** @type {any[]} */ abilities) {
  const slots = makeEmptySlots();
  for (const ability of abilities ?? []) {
    const id = normalizeAbilityId(ability?.id);
    if (!id) continue;
    const preferred = normalizeSlotIndex(ability?.slot);
    const preferredIndex = preferred ? preferred - 1 : -1;
    if (preferredIndex >= 0 && slots[preferredIndex] == null) {
      slots[preferredIndex] = id;
      continue;
    }
    const emptyIndex = firstEmptySlot(slots);
    if (emptyIndex === -1) break;
    slots[emptyIndex] = id;
  }
  return slots;
}

/** @returns {{ slots: (string | null)[], knownAbilityIds: string[] }} */
function sanitizeStoredState(/** @type {any} */ raw) {
  const knownAbilityIds = /** @type {string[]} */ (
    Array.isArray(raw?.knownAbilityIds)
      ? raw.knownAbilityIds
          .map((/** @type {any} */ entry) => normalizeAbilityId(entry))
          .filter((/** @type {string | null} */ entry) => !!entry)
      : []
  );
  return {
    slots: normalizeSlots(raw?.slots),
    knownAbilityIds,
  };
}

export function syncAbilityLoadoutState(/** @type {any[]} */ abilities, /** @type {any} */ storedState) {
  const learnedIds = buildKnownIds(abilities);
  if (!storedState) {
    return {
      slots: buildDefaultSlots(abilities),
      knownAbilityIds: learnedIds,
    };
  }

  const sanitized = sanitizeStoredState(storedState);
  const validIds = new Set(learnedIds);
  const prevKnown = new Set(sanitized.knownAbilityIds);
  const slots = makeEmptySlots();
  const seen = new Set();

  for (let i = 0; i < ABILITY_SLOTS; i += 1) {
    const id = sanitized.slots[i];
    if (!id || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    slots[i] = id;
  }

  for (const ability of abilities ?? []) {
    const id = normalizeAbilityId(ability?.id);
    if (!id || seen.has(id) || prevKnown.has(id)) continue;
    const emptyIndex = firstEmptySlot(slots);
    if (emptyIndex === -1) break;
    slots[emptyIndex] = id;
    seen.add(id);
  }

  return {
    slots,
    knownAbilityIds: learnedIds,
  };
}

export function setAbilityInLoadoutState(
  /** @type {any[]} */ abilities,
  /** @type {any} */ storedState,
  /** @type {any} */ abilityId,
  /** @type {any} */ slot
) {
  const normalizedId = normalizeAbilityId(abilityId);
  const normalizedSlot = normalizeSlotIndex(slot);
  const state = syncAbilityLoadoutState(abilities, storedState);
  if (!normalizedId || !normalizedSlot) return state;
  const validIds = new Set(buildKnownIds(abilities));
  if (!validIds.has(normalizedId)) return state;

  const next = {
    slots: state.slots.slice(),
    knownAbilityIds: state.knownAbilityIds.slice(),
  };
  const fromIndex = next.slots.indexOf(normalizedId);
  const toIndex = normalizedSlot - 1;
  if (fromIndex === toIndex) return next;

  const displaced = next.slots[toIndex];
  next.slots[toIndex] = normalizedId;
  if (fromIndex >= 0) {
    next.slots[fromIndex] = displaced ?? null;
  }
  return next;
}

export function swapAbilityLoadoutSlots(
  /** @type {any[]} */ abilities,
  /** @type {any} */ storedState,
  /** @type {any} */ fromSlot,
  /** @type {any} */ toSlot
) {
  const from = normalizeSlotIndex(fromSlot);
  const to = normalizeSlotIndex(toSlot);
  const state = syncAbilityLoadoutState(abilities, storedState);
  if (!from || !to || from === to) return state;
  const next = {
    slots: state.slots.slice(),
    knownAbilityIds: state.knownAbilityIds.slice(),
  };
  const fromIndex = from - 1;
  const toIndex = to - 1;
  const temp = next.slots[fromIndex];
  next.slots[fromIndex] = next.slots[toIndex];
  next.slots[toIndex] = temp;
  return next;
}

export function clearAbilityLoadoutSlot(
  /** @type {any[]} */ abilities,
  /** @type {any} */ storedState,
  /** @type {any} */ slot
) {
  const normalizedSlot = normalizeSlotIndex(slot);
  const state = syncAbilityLoadoutState(abilities, storedState);
  if (!normalizedSlot) return state;
  const next = {
    slots: state.slots.slice(),
    knownAbilityIds: state.knownAbilityIds.slice(),
  };
  next.slots[normalizedSlot - 1] = null;
  return next;
}

export function createAbilityLoadoutController(/** @type {any} */ opts = {}) {
  const storage = opts?.storage ?? null;
  const memory = new Map();

  function getKey(/** @type {any} */ playerId, /** @type {any} */ classId) {
    const safeClassId = typeof classId === 'string' && classId ? classId : 'default';
    const safePlayerId = typeof playerId === 'string' && playerId ? playerId : 'local';
    return `${STORAGE_KEY_PREFIX}:${safePlayerId}:${safeClassId}`;
  }

  function readRaw(/** @type {string} */ key) {
    if (memory.has(key)) {
      return memory.get(key) ?? null;
    }
    const getItem = storage?.getItem;
    if (typeof getItem !== 'function') return null;
    try {
      const raw = getItem.call(storage, key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeRaw(/** @type {string} */ key, /** @type {any} */ state) {
    memory.set(key, state);
    const setItem = storage?.setItem;
    if (typeof setItem !== 'function') return;
    try {
      setItem.call(storage, key, JSON.stringify(state));
    } catch {
      // Ignore storage quota/private mode failures and keep in-memory state.
    }
  }

  function resolveState(/** @type {any} */ ctx) {
    const key = getKey(ctx?.playerId, ctx?.classId);
    const rawState = readRaw(key);
    const nextState = syncAbilityLoadoutState(ctx?.abilities ?? [], rawState);
    if (!hasSameState(rawState, nextState)) {
      writeRaw(key, nextState);
    }
    return { key, state: nextState };
  }

  function commitState(/** @type {string} */ key, /** @type {any} */ state) {
    writeRaw(key, state);
    return state;
  }

  function toAbilityMap(/** @type {any[]} */ abilities) {
    return new Map((abilities ?? []).map((ability) => [ability.id, ability]));
  }

  return {
    getState(/** @type {any} */ ctx) {
      return resolveState(ctx).state;
    },
    getSlotIds(/** @type {any} */ ctx) {
      return resolveState(ctx).state.slots.slice();
    },
    getSignature(/** @type {any} */ ctx) {
      return resolveState(ctx).state.slots.map((entry) => entry ?? '-').join('|');
    },
    getAbilityForSlot(/** @type {any} */ ctx, /** @type {any} */ slot) {
      const normalizedSlot = normalizeSlotIndex(slot);
      if (!normalizedSlot) return null;
      const { state } = resolveState(ctx);
      const id = state.slots[normalizedSlot - 1];
      if (!id) return null;
      const abilityById = toAbilityMap(ctx?.abilities ?? []);
      return abilityById.get(id) ?? null;
    },
    getSlottedAbilities(/** @type {any} */ ctx) {
      const abilityById = toAbilityMap(ctx?.abilities ?? []);
      return resolveState(ctx).state.slots.map((id) => (id ? abilityById.get(id) ?? null : null));
    },
    setAbilityInSlot(/** @type {any} */ ctx, /** @type {any} */ abilityId, /** @type {any} */ slot) {
      const { key, state } = resolveState(ctx);
      return commitState(key, setAbilityInLoadoutState(ctx?.abilities ?? [], state, abilityId, slot));
    },
    swapSlots(/** @type {any} */ ctx, /** @type {any} */ fromSlot, /** @type {any} */ toSlot) {
      const { key, state } = resolveState(ctx);
      return commitState(key, swapAbilityLoadoutSlots(ctx?.abilities ?? [], state, fromSlot, toSlot));
    },
    clearSlot(/** @type {any} */ ctx, /** @type {any} */ slot) {
      const { key, state } = resolveState(ctx);
      return commitState(key, clearAbilityLoadoutSlot(ctx?.abilities ?? [], state, slot));
    },
  };
}
