// @ts-check

const ADMIN_ALIAS_KEY = 'ra.admin.alias';
const ADMIN_ALIAS_MAX_LENGTH = 48;
const ADMIN_ALIAS_PATTERN = /^[A-Za-z0-9 ._@-]+$/;

/**
 * @param {string} value
 */
function normalizeAlias(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > ADMIN_ALIAS_MAX_LENGTH) return '';
  if (!ADMIN_ALIAS_PATTERN.test(normalized)) return '';
  return normalized;
}

export function getStoredAdminAlias() {
  try {
    return normalizeAlias(localStorage.getItem(ADMIN_ALIAS_KEY) ?? '');
  } catch {
    return '';
  }
}

/**
 * @param {string} alias
 */
export function storeAdminAlias(alias) {
  const normalized = normalizeAlias(alias);
  if (!normalized) return;
  try {
    localStorage.setItem(ADMIN_ALIAS_KEY, normalized);
  } catch {
    // Ignore private-mode storage failures.
  }
}

/**
 * @param {{
 *   forcePrompt?: boolean,
 *   promptText?: string
 * }} [options]
 */
export function ensureAdminAlias(options = {}) {
  const forcePrompt = options.forcePrompt === true;
  let alias = forcePrompt ? '' : getStoredAdminAlias();
  const promptText =
    options.promptText ??
    'Enter your admin alias for audit logs and collaboration locks:';

  while (!alias) {
    const entered = window.prompt(promptText, getStoredAdminAlias() || '');
    if (entered === null) return null;
    alias = normalizeAlias(entered);
  }

  storeAdminAlias(alias);
  return alias;
}

/**
 * @param {HTMLElement | null} element
 * @param {string | null | undefined} alias
 */
export function renderAdminAlias(element, alias) {
  if (!element) return;
  const normalized = normalizeAlias(alias ?? '');
  element.textContent = normalized || 'Alias: admin';
}
