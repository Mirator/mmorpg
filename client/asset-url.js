// @ts-check

const ASSET_PREFIX = '/assets/';

/**
 * @param {{ __MMORPG_CLIENT_CONFIG__?: { assetVersion?: unknown }, location?: { origin?: string } } | null | undefined} windowLike
 */
export function getClientAssetVersion(windowLike = /** @type {any} */ (globalThis)) {
  const rawValue = windowLike?.__MMORPG_CLIENT_CONFIG__?.assetVersion;
  if (typeof rawValue !== 'string') return '';
  const value = rawValue.trim();
  return value || '';
}

/**
 * Adds the current asset version query to managed binary asset URLs while leaving non-asset URLs untouched.
 * @param {string} path
 * @param {{ windowLike?: { __MMORPG_CLIENT_CONFIG__?: { assetVersion?: unknown }, location?: { origin?: string } } | null }} [options]
 */
export function assetUrl(path, { windowLike = /** @type {any} */ (globalThis) } = {}) {
  const value = String(path ?? '');
  if (!value.startsWith(ASSET_PREFIX)) return value;

  const version = getClientAssetVersion(windowLike);
  if (!version) return value;

  const origin = windowLike?.location?.origin || 'http://localhost';
  const url = new URL(value, origin);
  if (!url.searchParams.has('v')) {
    url.searchParams.set('v', version);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
