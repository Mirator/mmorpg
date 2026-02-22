// @ts-check

/** @typedef {import('./types/domain.d.ts').HttpRequestLike} HttpRequestLike */
/** @typedef {import('./types/domain.d.ts').HttpResponseLike} HttpResponseLike */
/** @typedef {import('./types/domain.d.ts').NextFunctionLike} NextFunctionLike */

/**
 * @param {HttpRequestLike} req
 * @returns {boolean}
 */
function hasHeaderTokenAuth(req) {
  if (typeof req.get !== 'function') return false;
  const adminSession = req.get('x-admin-session');
  if (typeof adminSession === 'string' && adminSession.trim().length > 0) {
    return true;
  }
  const auth = req.get('authorization');
  if (typeof auth !== 'string') return false;
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice('Bearer '.length).trim().length > 0;
}

/**
 * @param {HttpRequestLike} req
 * @returns {string | null}
 */
function getRequestOrigin(req) {
  if (typeof req.get !== 'function') return null;
  const origin = req.get('origin');
  if (typeof origin === 'string' && origin.trim()) {
    return origin.trim();
  }
  const referer = req.get('referer');
  if (typeof referer !== 'string' || !referer.trim()) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * @param {HttpRequestLike} req
 * @returns {boolean}
 */
function isFetchMetadataAllowed(req) {
  if (typeof req.get !== 'function') return true;
  const fetchSite = req.get('sec-fetch-site');
  if (typeof fetchSite !== 'string' || !fetchSite.trim()) return true;
  return fetchSite.trim().toLowerCase() !== 'cross-site';
}

/**
 * @param {HttpResponseLike} res
 */
export function sendCsrfError(res) {
  res.status(403).json({ error: 'Forbidden' });
}

/**
 * @param {{
 *   allowedOrigins: Set<string>
 * }} params
 */
export function createCsrfGuard({ allowedOrigins }) {
  /**
   * @param {HttpRequestLike} req
   * @param {HttpResponseLike} res
   * @param {NextFunctionLike} next
   */
  return (req, res, next) => {
    // Cookie-authenticated routes need CSRF checks. Explicit header-token auth is exempt.
    if (hasHeaderTokenAuth(req)) {
      next();
      return;
    }
    if (!isFetchMetadataAllowed(req)) {
      sendCsrfError(res);
      return;
    }
    const origin = getRequestOrigin(req);
    if (!origin || !allowedOrigins.has(origin)) {
      sendCsrfError(res);
      return;
    }
    next();
  };
}
