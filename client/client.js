// @ts-check
import { showErrorOverlay, hideErrorOverlay } from './error-overlay.js';
import { createMenu } from './menu.js';
import { createAuth } from './auth.js';
import { createUiAudio } from './ui-audio.js';
import { logger } from './logger.js';
import { createLoadingScreen } from './loading.js';
import { createUiBridge } from './ui-bridge.js';

function installGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('Unhandled error:', message, source, lineno, colno, error);
    showErrorOverlay({
      title: 'Something went wrong',
      message: typeof message === 'string' ? message : 'An unexpected error occurred. Try reloading.',
      actions: [{ label: 'Reload', onClick: () => window.location.reload() }],
    });
    return true;
  };
  window.onunhandledrejection = (event) => {
    logger.error('Unhandled promise rejection:', event.reason);
    showErrorOverlay({
      title: 'Something went wrong',
      message: event.reason instanceof Error ? event.reason.message : String(event.reason),
      actions: [{ label: 'Reload', onClick: () => window.location.reload() }],
    });
  };
}

installGlobalErrorHandlers();

const app = document.getElementById('app');
const overlayEl = document.getElementById('overlay');
const accountNameEl = document.getElementById('account-name');
const characterNameEl = document.getElementById('overlay-character-name');
const loadingScreenEl = document.getElementById('loading-screen');
const loadingStageEl = document.getElementById('loading-stage');
const loadingTextEl = document.getElementById('loading-text');
const loadingTipEl = document.getElementById('loading-tip');
const loadingProgressBarEl = /** @type {HTMLElement | null} */ (document.querySelector('.loading-progress-bar'));
const loadingProgressFillEl = /** @type {HTMLElement | null} */ (document.getElementById('loading-progress-fill'));

const loading = createLoadingScreen({
  loadingScreenEl,
  loadingStageEl,
  loadingTextEl,
  loadingTipEl,
  loadingProgressBarEl,
  loadingProgressFillEl,
});

const uiBridge = createUiBridge();
const uiAudio = createUiAudio();
const urlParams = new URLSearchParams(window.location.search);
const isGuestSession = urlParams.get('guest') === '1';

/** @type {any | null} */
let runtime = null;
/** @type {Promise<any> | null} */
let runtimePromise = null;

async function ensureRuntime() {
  if (runtime) return runtime;
  if (!runtimePromise) {
    loading.showLoadingScreen({
      stage: 'Initializing client',
      message: 'Loading gameplay systems...',
      indeterminate: true,
    });
    runtimePromise = import('./game-runtime.js')
      .then(({ loadGameRuntime }) => {
        runtime = loadGameRuntime({
          app,
          menu,
          auth,
          uiBridge,
          uiAudio,
          loading,
          isGuestSession,
          overlayEl,
        });
        return runtime;
      })
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
  }
  return runtimePromise;
}

const menu = createMenu({
  onSignIn: (/** @type {any} */ data) => auth.signIn(data),
  onSignUp: (/** @type {any} */ data) => auth.signUp(data),
  onSelectCharacter: (/** @type {any} */ character) => auth.connectCharacter(character),
  onCreateCharacter: (/** @type {any} */ data) => auth.createCharacter(data),
  onDeleteCharacter: (/** @type {any} */ character) => auth.deleteCharacter(character),
  onSignOut: () => auth.signOut(),
});

const auth = createAuth({
  menu,
  ui: uiBridge,
  accountNameEl,
  characterNameEl,
  uiAudio,
});

auth.setOnDisconnect(() => {
  runtime?.disconnect?.();
});

auth.setOnConnectCharacter(async (/** @type {any} */ character) => {
  loading.showLoadingScreen({
    stage: 'Preparing session',
    message: 'Preparing character session...',
    indeterminate: true,
  });
  try {
    const loadedRuntime = await ensureRuntime();
    await loadedRuntime.startSession({ character });
  } finally {
    loading.hideLoadingScreen();
  }
});

if (isGuestSession) {
  uiBridge.setMenuOpen(false);
  menu.setOpen(false);
  auth.setGuestAccount();
  (async () => {
    loading.showLoadingScreen({
      stage: 'Preparing session',
      message: 'Preparing guest session...',
      indeterminate: true,
    });
    try {
      const loadedRuntime = await ensureRuntime();
      await loadedRuntime.startSession({ guest: true });
    } catch {
      uiAudio.play('error');
      hideErrorOverlay();
      showErrorOverlay({
        title: 'Could not connect',
        message: 'Check your network and try again.',
        actions: [
          {
            label: 'Retry',
            onClick: () => {
              hideErrorOverlay();
              window.location.href = `${window.location.pathname}?guest=1`;
            },
          },
          {
            label: 'Back',
            onClick: () => {
              hideErrorOverlay();
              window.location.href = window.location.pathname;
            },
          },
        ],
      });
    } finally {
      loading.hideLoadingScreen();
    }
  })();
} else {
  auth.initFromStorage();
  menu.setAccount(auth.getAccount());
  uiBridge.setMenuOpen(true);
  menu.setOpen(true);
  menu.setProgressStep('account');
  menu.setStatusMessage('Sign in to continue your journey.', 'neutral');
  auth.updateOverlayLabels();
  if (auth.getAccount()) {
    auth.loadCharacters().catch(() => {
      auth.clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      menu.setProgressStep('account');
      menu.setStatusMessage('Session expired. Sign in again.', 'error');
      uiBridge.setStatus('menu');
    });
  } else {
    menu.setStep('auth');
    menu.setTab('signin');
    menu.setProgressStep('account');
    menu.setStatusMessage('Sign in to continue your journey.', 'neutral');
    uiBridge.setStatus('menu');
  }
}
