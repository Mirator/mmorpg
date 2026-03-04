// @ts-check

import { DESIGNER_ZONE_KEY_DEFAULT, PATCH_STATUS, normalizeZoneKey } from '../shared/mapDesignerState.js';
import { createMapDesignerStateStore } from './mapDesignerStore.js';

/** @typedef {Error & { status?: number, details?: string[], revision?: number }} HttpErrorLike */

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function toInt(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(Number(value));
}

/**
 * @param {any} req
 * @returns {string}
 */
function getProvidedAdminAlias(req) {
  if (typeof req.get !== 'function') return 'admin';
  const raw = req.get('x-admin-alias');
  if (typeof raw !== 'string') return 'admin';
  const alias = raw
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return alias || 'admin';
}

/**
 * @param {{
 *   isAuthorized: (req: any) => boolean,
 *   mapConfigPath: string,
 *   designerStatePath: string,
 *   onAfterPublish?: (() => Promise<unknown>) | null,
 *   onAfterRollback?: (() => Promise<unknown>) | null
 * }} params
 */
export function createMapDesignerHandlers({
  isAuthorized,
  mapConfigPath,
  designerStatePath,
  onAfterPublish = null,
  onAfterRollback = null,
}) {
  const store = createMapDesignerStateStore({
    mapConfigPath,
    designerStatePath,
  });

  /**
   * @param {any} req
   */
  const zoneOf = (req) => normalizeZoneKey(req?.query?.zone ?? DESIGNER_ZONE_KEY_DEFAULT);
  /**
   * @param {any} req
   */
  const aliasOf = (req) => getProvidedAdminAlias(req);
  /**
   * @param {any} req
   */
  const idOf = (req) => String(req.params?.id ?? '');
  /**
   * @param {any} req
   */
  const layerIdOf = (req) => String(req.params?.layerId ?? '');

  /**
   * @param {any} res
   * @param {unknown} payload
   * @param {number} [status]
   */
  function sendPayload(res, payload, status = 200) {
    if (status === 200) {
      res.json(payload);
      return;
    }
    res.status(status).json(payload);
  }

  /**
   * @param {any} res
   * @param {unknown} err
   */
  function sendError(res, err) {
    const error = /** @type {HttpErrorLike} */ (
      err instanceof Error ? err : new Error('Designer API request failed.')
    );
    const status = Number.isInteger(error.status) ? Number(error.status) : 500;
    /** @type {{ error: string, details?: string[], revision?: number }} */
    const payload = {
      error: error.message || 'Designer API request failed.',
    };
    if (Array.isArray(error.details)) {
      payload.details = error.details;
    }
    if (Number.isFinite(error.revision)) {
      payload.revision = error.revision;
    }
    res.status(status).json(payload);
  }

  /**
   * @param {any} req
   * @param {any} res
   * @returns {boolean}
   */
  function guard(req, res) {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  /**
   * @param {any} req
   * @param {any} res
   * @param {(req: any) => unknown} action
   * @param {number} [status]
   */
  function run(req, res, action, status = 200) {
    if (!guard(req, res)) return;
    try {
      sendPayload(res, action(req), status);
    } catch (err) {
      sendError(res, err);
    }
  }

  /**
   * @param {any} req
   * @param {any} res
   * @param {(req: any) => Promise<unknown>} action
   * @param {number} [status]
   */
  async function runAsync(req, res, action, status = 200) {
    if (!guard(req, res)) return;
    try {
      sendPayload(res, await action(req), status);
    } catch (err) {
      sendError(res, err);
    }
  }

  /**
   * @param {{ restartRequired: boolean }} payload
   * @param {unknown} liveResult
   */
  function mergeLivePayload(payload, liveResult) {
    if (!liveResult || typeof liveResult !== 'object') return payload;
    const livePayload = /** @type {{ liveApplied?: boolean } & Record<string, unknown>} */ (liveResult);
    return {
      ...payload,
      restartRequired: livePayload.liveApplied ? false : payload.restartRequired,
      ...livePayload,
    };
  }

  /**
   * @param {(req: any) => unknown} action
   * @param {number} [status]
   * @returns {(req: any, res: any) => void}
   */
  function handler(action, status = 200) {
    return (req, res) => {
      run(req, res, action, status);
    };
  }

  /**
   * @param {(req: any) => Promise<unknown>} action
   * @param {number} [status]
   * @returns {(req: any, res: any) => Promise<void>}
   */
  function handlerAsync(action, status = 200) {
    return async (req, res) => {
      await runAsync(req, res, action, status);
    };
  }

  return {
    getDesignerState: handler((req) => store.getState(zoneOf(req))),
    putDesignerState: handler((req) =>
      store.putState(zoneOf(req), toInt(req?.body?.expectedRevision, -1), req?.body?.zoneState, aliasOf(req))
    ),
    getPrefabs: handler((req) => ({ prefabs: store.getPrefabs(zoneOf(req)) })),
    postPrefab: handler((req) => ({ prefab: store.createPrefab(zoneOf(req), req.body, aliasOf(req)) }), 201),
    putPrefab: handler((req) => ({
      prefab: store.updatePrefab(zoneOf(req), idOf(req), req.body, aliasOf(req)),
    })),
    deletePrefab: handler((req) => store.deletePrefab(zoneOf(req), idOf(req), aliasOf(req))),
    getPatches: handler((req) => ({ patches: store.listPatches(zoneOf(req)) })),
    postPatch: handler((req) => ({ patch: store.createPatch(zoneOf(req), req.body, aliasOf(req)) }), 201),
    postPatchRequestApproval: handler((req) => ({
      patch: store.transitionPatch(
        zoneOf(req),
        idOf(req),
        PATCH_STATUS.REVIEW_REQUESTED,
        aliasOf(req),
        'patch.request-approval'
      ),
    })),
    postPatchApprove: handler((req) => ({
      patch: store.transitionPatch(zoneOf(req), idOf(req), PATCH_STATUS.APPROVED, aliasOf(req), 'patch.approve'),
    })),
    postPatchPublish: handlerAsync(async (req) =>
      mergeLivePayload(
        await store.publishPatch(zoneOf(req), idOf(req), aliasOf(req)),
        typeof onAfterPublish === 'function' ? await onAfterPublish() : null
      )
    ),
    postPatchRollback: handlerAsync(async (req) =>
      mergeLivePayload(
        await store.rollbackPatch(zoneOf(req), idOf(req), aliasOf(req)),
        typeof onAfterRollback === 'function' ? await onAfterRollback() : null
      )
    ),
    getComments: handler((req) => ({ comments: store.listComments(zoneOf(req)) })),
    postComment: handler((req) => ({ comment: store.createComment(zoneOf(req), req.body, aliasOf(req)) }), 201),
    postCommentResolve: handler((req) => ({
      comment: store.resolveComment(zoneOf(req), idOf(req), req.body, aliasOf(req)),
    })),
    getLocks: handler((req) => ({ locks: store.getLocks(zoneOf(req)) })),
    postZoneLock: handler((req) => ({ locks: store.setZoneLock(zoneOf(req), req.body, aliasOf(req)) })),
    postLayerLock: handler((req) => ({
      locks: store.setLayerLock(zoneOf(req), layerIdOf(req), req.body, aliasOf(req)),
    })),
    getAudit: handler((req) => ({ audit: store.getAudit(zoneOf(req), toInt(req?.query?.limit, 200)) })),
    postPlaytestSession: handler((req) => store.createPlaytestSession(zoneOf(req))),
  };
}
