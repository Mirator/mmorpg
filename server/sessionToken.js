// @ts-check
import crypto from 'node:crypto';

/**
 * Hash session tokens before persistence so DB rows are not bearer-equivalent secrets.
 * @param {string} token
 * @returns {string}
 */
export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
