// @ts-check

const ADMIN_ALIAS_KEY = 'ra.admin.alias';

/**
 * @param {string} value
 */
function normalizeAlias(value) {
  return typeof value === 'string' ? value.trim() : '';
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
