// @ts-check

const ADMIN_SESSION_HINT_KEY = 'ra.admin.mapv2.session';

export function hasSessionRestoreHint() {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * @param {boolean} enabled
 */
export function setSessionRestoreHint(enabled) {
  try {
    if (enabled) {
      sessionStorage.setItem(ADMIN_SESSION_HINT_KEY, '1');
    } else {
      sessionStorage.removeItem(ADMIN_SESSION_HINT_KEY);
    }
  } catch {
    // Ignore private-mode storage failures.
  }
}
