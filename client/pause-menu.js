const CONTROLS = [
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

export function createPauseMenu({
  onResume,
  onOptions,
  onReturnToCharacterScreen,
  onSignOut,
  isGuest,
  setPauseMenuOpen,
}) {
  const root = document.getElementById('pause-menu');
  const mainView = document.getElementById('pause-menu-main');
  const controlsView = document.getElementById('pause-menu-controls');
  const controlsList = document.getElementById('controls-list');
  const resumeBtn = document.getElementById('pause-resume-btn');
  const optionsBtn = document.getElementById('pause-options-btn');
  const controlsBtn = document.getElementById('pause-controls-btn');
  const characterBtn = document.getElementById('pause-character-btn');
  const signOutBtn = document.getElementById('pause-signout-btn');
  const controlsBackBtn = document.getElementById('pause-controls-back-btn');

  let open = false;
  let showingControls = false;

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

  function setOpen(next) {
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
    mainView?.classList.remove('hidden');
    controlsView?.classList.add('hidden');
  }

  function showControls() {
    showingControls = true;
    mainView?.classList.add('hidden');
    controlsView?.classList.remove('hidden');
    renderControls();
  }

  function handleEscape() {
    if (showingControls) {
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
    onOptions?.();
  });

  controlsBtn?.addEventListener('click', () => {
    showControls();
  });

  controlsBackBtn?.addEventListener('click', () => {
    showMain();
  });

  characterBtn?.addEventListener('click', () => {
    onReturnToCharacterScreen?.();
  });

  signOutBtn?.addEventListener('click', () => {
    onSignOut?.();
  });

  renderControls();

  if (characterBtn) {
    characterBtn.style.display = isGuest ? 'none' : '';
  }

  return {
    setOpen,
    isOpen,
    showMain,
    handleEscape,
  };
}
