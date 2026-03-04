// @ts-check

import { ensureAdminAlias, getStoredAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

/** @typedef {Error & { status?: number }} SessionError */

const MAP_SESSION_HINT_KEY = 'ra.admin.mapv2.session';

/**
 * @typedef {{
 *   form: HTMLFormElement | null,
 *   passInput: HTMLInputElement | null,
 *   statusEl: HTMLElement | null,
 *   aliasLabel: HTMLElement | null,
 *   aliasBtn?: HTMLButtonElement | null,
 *   lockBtn?: HTMLButtonElement | null,
 * }} SessionShellElements
 */

/**
 * @typedef {{
 *   checkingMessage?: string,
 *   lockedMessage?: string,
 *   invalidPasswordMessage?: string,
 *   aliasRequiredMessage?: string,
 *   sessionExpiredMessage?: string,
 *   readyMessage?: string,
 *   onLocked?: (message: string) => void,
 *   onRestore?: () => Promise<void>,
 * }} SessionShellOptions
 */

/**
 * @param {SessionShellElements} elements
 * @param {SessionShellOptions} [options]
 */
export function createSessionShell(elements, options = {}) {
  let alias = getStoredAdminAlias();
  const api = createDesignerApi({
    getAlias: () => alias,
  });

  const checkingMessage = options.checkingMessage ?? 'Status: checking session...';
  const lockedMessage = options.lockedMessage ?? 'Status: locked';
  const invalidPasswordMessage = options.invalidPasswordMessage ?? 'Status: invalid password.';
  const aliasRequiredMessage = options.aliasRequiredMessage ?? 'Status: alias required.';
  const sessionExpiredMessage = options.sessionExpiredMessage ?? 'Status: session expired. Unlock again.';
  const readyMessage = options.readyMessage ?? 'Status: ready.';

  /**
   * @param {boolean} enabled
   */
  function setMapSessionHint(enabled) {
    try {
      if (enabled) {
        sessionStorage.setItem(MAP_SESSION_HINT_KEY, '1');
      } else {
        sessionStorage.removeItem(MAP_SESSION_HINT_KEY);
      }
    } catch {
      // Ignore private-mode storage failures.
    }
  }

  /**
   * @param {string} message
   * @param {string} [tone]
   */
  function setStatus(message, tone = 'neutral') {
    if (!elements.statusEl) return;
    elements.statusEl.textContent = message;
    elements.statusEl.className = `status ${tone}`;
  }

  function renderAlias() {
    renderAdminAlias(elements.aliasLabel, alias ? `Alias: ${alias}` : 'Alias: --');
  }

  function getAlias() {
    return alias;
  }

  /**
   * @param {string} [message]
   */
  function setLockedState(message = lockedMessage) {
    setMapSessionHint(false);
    if (typeof options.onLocked === 'function') {
      options.onLocked(message);
    }
    setStatus(message, 'warning');
  }

  /**
   * @param {unknown} err
   * @param {string} [message]
   * @returns {boolean}
   */
  function handleUnauthorized(err, message = sessionExpiredMessage) {
    const error = /** @type {SessionError} */ (err);
    if (error.status !== 401) return false;
    setLockedState(message);
    return true;
  }

  async function restore() {
    await api.getAdminSession();
    setMapSessionHint(true);
    if (typeof options.onRestore === 'function') {
      await options.onRestore();
    }
  }

  async function unlock() {
    const password = elements.passInput?.value.trim() ?? '';
    if (!password) return false;

    const nextAlias = ensureAdminAlias();
    if (!nextAlias) {
      setStatus(aliasRequiredMessage, 'warning');
      return false;
    }

    alias = nextAlias;
    renderAlias();

    try {
      await api.unlockAdminSession(password);
      setMapSessionHint(true);
      if (elements.passInput) {
        elements.passInput.value = '';
      }
      if (typeof options.onRestore === 'function') {
        await options.onRestore();
      }
      setStatus(readyMessage, 'ok');
      return true;
    } catch (err) {
      const error = /** @type {SessionError} */ (err);
      if (error.status === 401) {
        setStatus(invalidPasswordMessage, 'error');
        return false;
      }
      setStatus(`Status: ${error.message}`, 'error');
      return false;
    }
  }

  async function boot() {
    alias = getStoredAdminAlias();
    renderAlias();
    setStatus(checkingMessage, 'neutral');
    try {
      await restore();
      setStatus(readyMessage, 'ok');
    } catch {
      setLockedState(lockedMessage);
    }
  }

  elements.form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await unlock();
  });

  elements.aliasBtn?.addEventListener('click', () => {
    const nextAlias = ensureAdminAlias({ forcePrompt: true });
    if (!nextAlias) return;
    alias = nextAlias;
    renderAlias();
  });

  elements.lockBtn?.addEventListener('click', async () => {
    try {
      await api.logoutAdminSession();
    } catch {
      // Ignore remote logout failures and still reset local state.
    }
    setLockedState(lockedMessage);
  });

  return {
    api,
    getAlias,
    setStatus,
    setLockedState,
    handleUnauthorized,
    boot,
    unlock,
  };
}
