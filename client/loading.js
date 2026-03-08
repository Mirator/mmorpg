// @ts-check

const LOADING_TIPS = [
  'Tip: Press K to open skills while in game.',
  'Tip: Drag items onto equipment slots to equip them.',
  'Tip: Press ESC to open the in-game pause menu.',
  'Tip: Use TAB to cycle nearby targets quickly.',
];

/**
 * @typedef {{
 *   stage?: string;
 *   message?: string;
 *   progress?: number;
 *   indeterminate?: boolean;
 * }} LoadingState
 */

/**
 * @param {{
 *   loadingScreenEl: HTMLElement | null;
 *   loadingStageEl: HTMLElement | null;
 *   loadingTextEl: HTMLElement | null;
 *   loadingTipEl: HTMLElement | null;
 *   loadingProgressBarEl: HTMLElement | null;
 *   loadingProgressFillEl: HTMLElement | null;
 * }} refs
 * @returns {{ showLoadingScreen: (options?: LoadingState | string) => void; hideLoadingScreen: () => void; updateLoadingFromNetworkStage: (stage: string) => void }}
 */
export function createLoadingScreen(refs) {
  const {
    loadingScreenEl,
    loadingStageEl,
    loadingTextEl,
    loadingTipEl,
    loadingProgressBarEl,
    loadingProgressFillEl,
  } = refs;

  let /** @type {ReturnType<typeof setInterval> | null} */ loadingTipInterval = null;
  let loadingTipIndex = 0;

  function startLoadingTips() {
    if (!loadingTipEl) return;
    loadingTipEl.textContent = LOADING_TIPS[loadingTipIndex % LOADING_TIPS.length];
    if (loadingTipInterval) return;
    loadingTipInterval = setInterval(() => {
      loadingTipIndex = (loadingTipIndex + 1) % LOADING_TIPS.length;
      if (loadingTipEl) loadingTipEl.textContent = LOADING_TIPS[loadingTipIndex];
    }, 3500);
  }

  function stopLoadingTips() {
    if (loadingTipInterval) {
      clearInterval(loadingTipInterval);
      loadingTipInterval = null;
    }
  }

  function showLoadingScreen(/** @type {LoadingState | string} */ options = {}) {
    const normalized = typeof options === 'string' ? { message: options } : options;
    const {
      stage = 'Preparing session',
      message = 'Loading...',
      progress = undefined,
      indeterminate = false,
    } = normalized;
    if (loadingStageEl) loadingStageEl.textContent = stage;
    if (loadingTextEl) loadingTextEl.textContent = message;
    loadingScreenEl?.classList.add('visible');
    startLoadingTips();
    if (loadingProgressBarEl) {
      const showBar = indeterminate || typeof progress === 'number';
      loadingProgressBarEl.classList.toggle('hidden', !showBar);
      loadingProgressBarEl.classList.toggle('indeterminate', !!indeterminate);
      if (typeof progress === 'number') {
        const clamped = Math.max(0, Math.min(100, progress));
        loadingProgressBarEl.style.setProperty('--progress', String(clamped));
        loadingProgressBarEl.classList.remove('hidden');
        loadingProgressBarEl.setAttribute('aria-valuenow', String(Math.round(clamped)));
      } else if (showBar) {
        loadingProgressBarEl.removeAttribute('aria-valuenow');
      }
    }
    if (loadingProgressFillEl) {
      loadingProgressFillEl.classList.toggle('hidden', !!indeterminate);
    }
  }

  function hideLoadingScreen() {
    loadingScreenEl?.classList.remove('visible');
    stopLoadingTips();
  }

  function updateLoadingFromNetworkStage(/** @type {string} */ stage) {
    if (stage === 'socket_open') {
      showLoadingScreen({
        stage: 'Connecting realm',
        message: 'Realm link established. Handshaking...',
        indeterminate: true,
      });
      return;
    }
    if (stage === 'awaiting_welcome') {
      showLoadingScreen({
        stage: 'Syncing world state',
        message: 'Syncing character and world snapshot...',
        indeterminate: true,
      });
      return;
    }
    if (stage === 'world_ready') {
      showLoadingScreen({
        stage: 'Syncing world state',
        message: 'Finalizing entry...',
        progress: 100,
      });
    }
  }

  return { showLoadingScreen, hideLoadingScreen, updateLoadingFromNetworkStage };
}
