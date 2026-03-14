// @ts-check

/**
 * Lightweight UI facade used by the auth/menu shell before the full in-game UI runtime exists.
 * Once the runtime is attached, calls are forwarded to the live UI implementation.
 */
/**
 * @typedef {{
 *   setMenuOpen?: (open: boolean) => void;
 *   setStatus?: (status: string) => void;
 * } | null} RuntimeUi
 */
export function createUiBridge({
  body = typeof document === 'undefined' ? null : document.body,
} = {}) {
  /** @type {RuntimeUi} */
  let runtimeUi = null;
  let menuOpen = true;
  let status = 'menu';

  function applyShellMenuState() {
    const hasClassList = !!body && typeof body === 'object' && 'classList' in body;
    if (hasClassList) {
      const shellBody = /** @type {{ classList: DOMTokenList }} */ (/** @type {unknown} */ (body));
      shellBody.classList.toggle('menu-open', menuOpen);
    }
  }

  /** @param {boolean} open */
  function setMenuOpen(open) {
    menuOpen = !!open;
    if (runtimeUi?.setMenuOpen) {
      runtimeUi.setMenuOpen(menuOpen);
      return;
    }
    applyShellMenuState();
  }

  /** @param {string} nextStatus */
  function setStatus(nextStatus) {
    status = typeof nextStatus === 'string' ? nextStatus : 'menu';
    runtimeUi?.setStatus?.(status);
  }

  /** @param {RuntimeUi} ui */
  function attachRuntime(ui) {
    runtimeUi = ui ?? null;
    if (!runtimeUi) {
      applyShellMenuState();
      return null;
    }
    runtimeUi.setMenuOpen?.(menuOpen);
    runtimeUi.setStatus?.(status);
    return runtimeUi;
  }

  function detachRuntime() {
    runtimeUi = null;
    applyShellMenuState();
  }

  applyShellMenuState();

  return {
    setMenuOpen,
    setStatus,
    attachRuntime,
    detachRuntime,
    isMenuOpen: () => menuOpen,
    getStatus: () => status,
    getRuntimeUi: () => runtimeUi,
  };
}
