// @ts-check
import crypto from 'node:crypto';
import { getCookieValue, normalizeId } from './authParsing.js';

/** @typedef {import('./types/domain.d.ts').HttpRequestLike} HttpRequestLike */

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
export function timingSafeEqualText(left, right) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

/**
 * @param {{
 *   password: string | null,
 *   cookieName: string,
 *   idleTimeoutMs: number,
 *   now?: () => number
 * }} params
 */
export function createAdminSessionStore({
  password,
  cookieName,
  idleTimeoutMs,
  now = () => Date.now(),
}) {
  const sessionTimeoutMs = Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0
    ? Math.floor(idleTimeoutMs)
    : 30 * 60 * 1000;

  /** @type {Map<string, { lastSeenAt: number }>} */
  const sessions = new Map();

  /**
   * @param {number} [at]
   */
  function cleanupExpired(at = now()) {
    for (const [token, session] of sessions) {
      if (at - session.lastSeenAt > sessionTimeoutMs) {
        sessions.delete(token);
      }
    }
  }

  /**
   * @param {unknown} candidate
   * @returns {candidate is string}
   */
  function isPasswordValid(candidate) {
    if (typeof candidate !== 'string' || typeof password !== 'string') return false;
    if (!candidate || !password) return false;
    return timingSafeEqualText(candidate, password);
  }

  function issueSessionToken() {
    cleanupExpired();
    let token = '';
    do {
      token = crypto.randomBytes(32).toString('hex');
    } while (sessions.has(token));

    sessions.set(token, { lastSeenAt: now() });
    return token;
  }

  /**
   * @param {unknown} rawToken
   * @param {{ touch?: boolean }} [options]
   */
  function validateSessionToken(rawToken, options = {}) {
    const touch = options.touch !== false;
    const token = normalizeId(rawToken, 128);
    if (!token) return false;

    const at = now();
    const session = sessions.get(token);
    if (!session) return false;
    if (at - session.lastSeenAt > sessionTimeoutMs) {
      sessions.delete(token);
      return false;
    }

    if (touch) {
      session.lastSeenAt = at;
    }
    cleanupExpired(at);
    return true;
  }

  /**
   * @param {HttpRequestLike} req
   * @returns {string | null}
   */
  function getSessionTokenFromRequest(req) {
    const headerToken = typeof req.get === 'function' ? req.get('x-admin-session') ?? '' : '';
    const headerNormalized = normalizeId(headerToken, 128);
    if (headerNormalized) return headerNormalized;
    return normalizeId(getCookieValue(req, cookieName), 128);
  }

  /**
   * @param {HttpRequestLike} req
   * @param {{ touch?: boolean }} [options]
   */
  function hasValidSession(req, options = {}) {
    const token = getSessionTokenFromRequest(req);
    if (!token) return false;
    return validateSessionToken(token, options);
  }

  /**
   * @param {unknown} rawToken
   */
  function revokeSessionToken(rawToken) {
    const token = normalizeId(rawToken, 128);
    if (!token) return false;
    return sessions.delete(token);
  }

  /**
   * @param {HttpRequestLike} req
   */
  function revokeSessionFromRequest(req) {
    const token = getSessionTokenFromRequest(req);
    if (!token) return false;
    return sessions.delete(token);
  }

  /**
   * @param {unknown} candidatePassword
   */
  function issueSessionFromPassword(candidatePassword) {
    if (!isPasswordValid(candidatePassword)) return null;
    return issueSessionToken();
  }

  return {
    isPasswordValid,
    issueSessionToken,
    issueSessionFromPassword,
    validateSessionToken,
    hasValidSession,
    getSessionTokenFromRequest,
    revokeSessionToken,
    revokeSessionFromRequest,
    cleanupExpired,
    getSessionCount() {
      cleanupExpired();
      return sessions.size;
    },
  };
}
