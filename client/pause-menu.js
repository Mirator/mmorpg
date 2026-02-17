// @ts-check
import {
  getKeybinds,
  setKeybind,
  resetKeybinds,
  DEFAULT_KEYBINDS,
} from './keybinds.js';

const /** @type {any} */ CONTROLS = [
  { key: 'W A S D', action: 'Move' },
  { key: 'Click', action: 'Move to location' },
  { key: 'Click / TAB', action: 'Select / cycle targets' },
  { key: 'E', action: 'Interact' },
  { key: 'I', action: 'Inventory' },
  { key: 'C', action: 'Character sheet' },
  { key: 'K', action: 'Skills' },
  { key: '1 - 0', action: 'Abilities' },
  { key: 'F', action: 'Fullscreen' },
  { key: 'ESC', action: 'Game menu' },
];

const /** @type {any} */ KEYBIND_LABELS = {
  moveForward: 'Move forward',
  moveBack: 'Move back',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  interact: 'Interact',
  inventory: 'Inventory',
  character: 'Character sheet',
  skills: 'Skills',
  fullscreen: 'Fullscreen',
  pause: 'Game menu',
  cycleTarget: 'Cycle target',
  tradeBuy: 'Trade (buy tab)',
  tradeSell: 'Trade (sell tab)',
  ability1: 'Ability 1',
  ability2: 'Ability 2',
  ability3: 'Ability 3',
  ability4: 'Ability 4',
  ability5: 'Ability 5',
  ability6: 'Ability 6',
  ability7: 'Ability 7',
  ability8: 'Ability 8',
  ability9: 'Ability 9',
  ability10: 'Ability 10',
};

function formatKeyForDisplay(/** @type {any} */ key) {
  if (!key) return '—';
  if (key === 'Escape') return 'ESC';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function createPauseMenu(/** @type {any} */ {
  onResume,
  onReturnToCharacterScreen,
  onSignOut,
  isGuest,
  setPauseMenuOpen,
  getShowFps,
  setShowFps,
}) {
  const root = document.getElementById('pause-menu');
  const mainView = document.getElementById('pause-menu-main');
  const controlsView = document.getElementById('pause-menu-controls');
  const optionsView = document.getElementById('pause-menu-options');
  const controlsList = document.getElementById('controls-list');
  const keybindsList = document.getElementById('keybinds-list');
  const resumeBtn = document.getElementById('pause-resume-btn');
  const optionsBtn = document.getElementById('pause-options-btn');
  const controlsBtn = document.getElementById('pause-controls-btn');
  const characterBtn = document.getElementById('pause-character-btn');
  const signOutBtn = document.getElementById('pause-signout-btn');
  const controlsBackBtn = document.getElementById('pause-controls-back-btn');
  const optionsBackBtn = document.getElementById('pause-options-back-btn');
  const fpsToggle = /** @type {HTMLInputElement | null} */ (document.getElementById('pause-fps-toggle'));
  const keybindsResetBtn = document.getElementById('keybinds-reset-btn');

  let open = false;
  let showingControls = false;
  let showingOptions = false;
  let /** @type {any} */ rebindingAction = null;

  function renderControls() {
    if (!controlsList) return;
    controlsList.innerHTML = '';
    for (const { key, action } of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'controls-row';
      row.innerHTML = `<span>${action}</span><kbd>${key}</kbd>`;
      controlsList.appendChild(row);
    }
  }

  function renderKeybinds() {
    if (!keybindsList) return;
    keybindsList.innerHTML = '';
    const keybinds = getKeybinds();
    for (const [action, label] of Object.entries(KEYBIND_LABELS)) {
      const row = document.createElement('div');
      row.className = 'keybind-row' + (rebindingAction === action ? ' rebinding' : '');
      row.dataset.action = action;
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const keyEl = document.createElement('kbd');
      keyEl.className = 'keybind-key';
      keyEl.textContent = formatKeyForDisplay(keybinds[action] ?? DEFAULT_KEYBINDS[action]);
      row.appendChild(labelEl);
      row.appendChild(keyEl);
      row.addEventListener('click', () => {
        if (rebindingAction) return;
        rebindingAction = action;
        keyEl.textContent = 'Press key...';
        row.classList.add('rebinding');
        renderKeybinds();
        window.addEventListener('keydown', handleRebindKey);
      });
      keybindsList.appendChild(row);
    }
  }

  function handleRebindKey(/** @type {any} */ event) {
    if (!rebindingAction) return;
    event.preventDefault();
    event.stopPropagation();
    const key = event.key;
    const code = event.code;
    if (key === 'Escape') {
      rebindingAction = null;
      renderKeybinds();
      window.removeEventListener('keydown', handleRebindKey);
      return;
    }
    let bindKey = key;
    if (code?.match(/^(Digit|Numpad)(\d)$/i)) {
      bindKey = code.replace(/^(Digit|Numpad)/i, '');
    }
    if (bindKey && bindKey.length <= 2) {
      setKeybind(rebindingAction, bindKey);
      rebindingAction = null;
      renderKeybinds();
    }
    window.removeEventListener('keydown', handleRebindKey);
  }

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    root?.classList.toggle('open', open);
    root?.setAttribute('aria-hidden', String(!open));
    setPauseMenuOpen?.(open);
    if (open) {
      showMain();
    }
  }

  function showMain() {
    showingControls = false;
    showingOptions = false;
    rebindingAction = null;
    mainView?.classList.remove('hidden');
    controlsView?.classList.add('hidden');
    optionsView?.classList.add('hidden');
    window.removeEventListener('keydown', handleRebindKey);
  }

  function showControls() {
    showingControls = true;
    showingOptions = false;
    mainView?.classList.add('hidden');
    controlsView?.classList.remove('hidden');
    optionsView?.classList.add('hidden');
    renderControls();
  }

  function showOptions() {
    showingControls = false;
    showingOptions = true;
    mainView?.classList.add('hidden');
    controlsView?.classList.add('hidden');
    optionsView?.classList.remove('hidden');
    renderKeybinds();
    if (fpsToggle && typeof getShowFps === 'function') {
      fpsToggle.checked = !!getShowFps();
    }
  }

  function handleEscape() {
    if (rebindingAction) {
      rebindingAction = null;
      renderKeybinds();
      return;
    }
    if (showingControls || showingOptions) {
      showMain();
    } else {
      setOpen(false);
    }
  }

  function isOpen() {
    return open;
  }

  resumeBtn?.addEventListener('click', () => {
    if (open) {
      onResume?.();
    }
  });

  optionsBtn?.addEventListener('click', () => {
    showOptions();
  });

  controlsBtn?.addEventListener('click', () => {
    showControls();
  });

  controlsBackBtn?.addEventListener('click', () => {
    showMain();
  });

  optionsBackBtn?.addEventListener('click', () => {
    showMain();
  });

  characterBtn?.addEventListener('click', () => {
    onReturnToCharacterScreen?.();
  });

  signOutBtn?.addEventListener('click', () => {
    onSignOut?.();
  });

  if (fpsToggle && typeof setShowFps === 'function') {
    fpsToggle.addEventListener('change', () => {
      setShowFps(fpsToggle.checked);
    });
  }

  if (keybindsResetBtn) {
    keybindsResetBtn.addEventListener('click', () => {
      resetKeybinds();
      renderKeybinds();
    });
  }

  renderControls();

  if (characterBtn) {
    characterBtn.style.display = isGuest ? 'none' : '';
  }

  return {
    setOpen,
    isOpen,
    showMain,
    handleEscape,
    renderKeybinds,
  };
}
