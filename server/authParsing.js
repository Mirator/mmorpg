// @ts-check
const ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function normalizeId(/** @type {any} */ raw, /** @type {any} */ maxLength = 64) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (!ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function getCookieValue(/** @type {any} */ req, /** @type {any} */ name) {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== name) continue;
    const value = trimmed.slice(eq + 1).trim();
    return value ? decodeURIComponent(value) : '';
  }
  return null;
}
