// @ts-check
// @ts-nocheck

/** @typedef {Error & { status?: number, details?: string[], revision?: number }} ApiError */

/**
 * @param {string} path
 * @param {string} zoneKey
 */
function withZone(path, zoneKey) {
  const hasQuery = path.includes('?');
  const encoded = encodeURIComponent(zoneKey);
  return `${path}${hasQuery ? '&' : '?'}zone=${encoded}`;
}

/**
 * @param {Response} res
 */
async function parsePayload(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   getAlias?: () => string,
 *   getZoneKey?: () => string
 * }} deps
 */
export function createDesignerApi({ getAlias, getZoneKey }) {
  const resolveAlias = () => {
    const alias = typeof getAlias === 'function' ? getAlias() : '';
    return typeof alias === 'string' && alias.trim() ? alias.trim() : 'admin';
  };

  const resolveZoneKey = () => {
    const zoneKey = typeof getZoneKey === 'function' ? getZoneKey() : 'world-map';
    return typeof zoneKey === 'string' && zoneKey.trim() ? zoneKey.trim() : 'world-map';
  };

  /**
   * @param {string} url
   * @param {{ method?: string, body?: unknown, mutating?: boolean, zoneScoped?: boolean }} [options]
   */
  async function request(url, options = {}) {
    const method = options.method ?? 'GET';
    const zoneScoped = options.zoneScoped !== false;
    const path = zoneScoped ? withZone(url, resolveZoneKey()) : url;

    /** @type {Record<string, string>} */
    const headers = {
      'x-admin-api': '1',
    };

    if (options.mutating) {
      headers['x-admin-alias'] = resolveAlias();
    }

    let body;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const res = await fetch(path, {
      method,
      headers,
      body,
      credentials: 'same-origin',
    });

    const payload = await parsePayload(res);
    if (!res.ok) {
      const error = /** @type {ApiError} */ (
        new Error(payload?.error ?? `Request failed (${res.status})`)
      );
      error.status = res.status;
      if (Array.isArray(payload?.details)) {
        error.details = payload.details;
      }
      if (Number.isFinite(payload?.revision)) {
        error.revision = Number(payload.revision);
      }
      throw error;
    }

    return payload;
  }

  return {
    unlockAdminSession(password) {
      return request('/admin/auth/unlock', {
        method: 'POST',
        zoneScoped: false,
        body: { password },
      });
    },

    getAdminSession() {
      return request('/admin/auth/session', {
        zoneScoped: false,
      });
    },

    logoutAdminSession() {
      return request('/admin/auth/logout', {
        method: 'POST',
        zoneScoped: false,
      });
    },

    getAdminState() {
      return request('/admin/state', { zoneScoped: false });
    },

    getMapConfig() {
      return request('/admin/map-config', { zoneScoped: false });
    },

    putMapConfig(config) {
      return request('/admin/map-config', {
        method: 'PUT',
        mutating: true,
        zoneScoped: false,
        body: config,
      });
    },

    getDesignerState() {
      return request('/admin/designer-state');
    },

    putDesignerState(expectedRevision, zoneState) {
      return request('/admin/designer-state', {
        method: 'PUT',
        mutating: true,
        body: {
          expectedRevision,
          zoneState,
        },
      });
    },

    getPrefabs() {
      return request('/admin/prefabs');
    },

    createPrefab(payload) {
      return request('/admin/prefabs', {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    updatePrefab(prefabId, payload) {
      return request(`/admin/prefabs/${encodeURIComponent(prefabId)}`, {
        method: 'PUT',
        mutating: true,
        body: payload,
      });
    },

    deletePrefab(prefabId) {
      return request(`/admin/prefabs/${encodeURIComponent(prefabId)}`, {
        method: 'DELETE',
        mutating: true,
      });
    },

    getPatches() {
      return request('/admin/patches');
    },

    createPatch(payload) {
      return request('/admin/patches', {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    requestPatchApproval(patchId) {
      return request(`/admin/patches/${encodeURIComponent(patchId)}/request-approval`, {
        method: 'POST',
        mutating: true,
      });
    },

    approvePatch(patchId) {
      return request(`/admin/patches/${encodeURIComponent(patchId)}/approve`, {
        method: 'POST',
        mutating: true,
      });
    },

    publishPatch(patchId) {
      return request(`/admin/patches/${encodeURIComponent(patchId)}/publish`, {
        method: 'POST',
        mutating: true,
      });
    },

    rollbackPatch(patchId) {
      return request(`/admin/patches/${encodeURIComponent(patchId)}/rollback`, {
        method: 'POST',
        mutating: true,
      });
    },

    getComments() {
      return request('/admin/comments');
    },

    createComment(payload) {
      return request('/admin/comments', {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    resolveComment(commentId, payload = undefined) {
      return request(`/admin/comments/${encodeURIComponent(commentId)}/resolve`, {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    getLocks() {
      return request('/admin/locks');
    },

    setZoneLock(payload) {
      return request('/admin/locks/zone', {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    setLayerLock(layerId, payload) {
      return request(`/admin/locks/layer/${encodeURIComponent(layerId)}`, {
        method: 'POST',
        mutating: true,
        body: payload,
      });
    },

    getAudit(limit = 200) {
      return request(`/admin/audit?limit=${Math.max(1, Math.floor(limit))}`);
    },

    createPlaytestSession() {
      return request('/admin/playtest/session', {
        method: 'POST',
        mutating: true,
      });
    },
  };
}
