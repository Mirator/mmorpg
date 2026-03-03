// @ts-check

function deepClone(/** @type {unknown} */ value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/** @typedef {Error & { status?: number, revision?: number }} StoreError */

/**
 * @param {{
 *   getDesignerState: () => Promise<{ revision: number, zoneState: any }>,
 *   putDesignerState: (expectedRevision: number, zoneState: any) => Promise<{ revision: number, zoneState: any }>,
 * }} api
 */
export function createDesignerStore(api) {
  let revision = -1;
  let /** @type {any} */ zoneState = null;

  function hasLoaded() {
    return revision >= 0 && zoneState !== null;
  }

  function getSnapshot() {
    return {
      revision,
      zoneState: zoneState ? deepClone(zoneState) : null,
    };
  }

  async function load() {
    const payload = await api.getDesignerState();
    revision = Number(payload.revision ?? 0);
    zoneState = deepClone(payload.zoneState ?? {});
    return getSnapshot();
  }

  /**
   * @param {any} nextZoneState
   */
  function setLocal(nextZoneState) {
    zoneState = deepClone(nextZoneState ?? {});
    return getSnapshot();
  }

  /**
   * @param {(draft: any) => void} mutator
   */
  function updateLocal(mutator) {
    const draft = deepClone(zoneState ?? {});
    mutator(draft);
    zoneState = draft;
    return getSnapshot();
  }

  /**
   * @param {any} payloadZoneState
   */
  async function save(payloadZoneState = zoneState) {
    if (!hasLoaded()) {
      throw new Error('Designer state must be loaded before save.');
    }

    try {
      const payload = await api.putDesignerState(revision, payloadZoneState);
      revision = Number(payload.revision ?? revision);
      zoneState = deepClone(payload.zoneState ?? payloadZoneState ?? {});
      return {
        ok: true,
        conflict: false,
        ...getSnapshot(),
      };
    } catch (err) {
      const error = /** @type {StoreError} */ (err);
      if (error.status === 409) {
        const latest = await api.getDesignerState();
        revision = Number(latest.revision ?? revision);
        zoneState = deepClone(latest.zoneState ?? {});
        return {
          ok: false,
          conflict: true,
          ...getSnapshot(),
          error,
        };
      }
      throw error;
    }
  }

  return {
    hasLoaded,
    load,
    save,
    setLocal,
    updateLocal,
    getSnapshot,
  };
}
