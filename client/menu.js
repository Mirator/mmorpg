// @ts-check
export function createMenu(/** @type {any} */ {
  onSignIn,
  onSignUp,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  onSignOut,
}) {
  const root = document.getElementById('menu');
  const tabButtons = /** @type {HTMLButtonElement[]} */ (Array.from(root?.querySelectorAll('.menu-tab') ?? []));
  const signInForm = /** @type {HTMLFormElement | null} */ (document.getElementById('signin-form'));
  const signUpForm = /** @type {HTMLFormElement | null} */ (document.getElementById('signup-form'));
  const authErrorEl = document.getElementById('menu-auth-error');
  const charactersErrorEl = document.getElementById('menu-characters-error');
  const createErrorEl = document.getElementById('menu-create-error');
  const accountEl = document.getElementById('menu-account');
  const lastCharacterEl = document.getElementById('menu-last-character');
  const characterListEl = document.getElementById('character-list');
  const createOpenBtn = document.getElementById('character-create-open');
  const createCancelBtn = document.getElementById('character-create-cancel');
  const signOutBtn = document.getElementById('menu-signout');
  const createForm = /** @type {HTMLFormElement | null} */ (document.getElementById('character-create-form'));

  let open = true;
  let step = 'auth';
  let tab = 'signin';
  let /** @type {any} */ characters = [];
  let /** @type {any} */ selectedCharacterId = null;

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    root?.classList.toggle('open', open);
    if (root?.toggleAttribute) {
      root.toggleAttribute('inert', !open);
    }
    if (!open) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && root?.contains(active)) {
        active.blur();
      }
    }
  }

  function setStep(/** @type {any} */ next) {
    step = next;
    if (root) root.dataset.step = step;
    clearErrors();
  }

  function setTab(/** @type {any} */ next) {
    tab = next;
    if (root) root.dataset.tab = tab;
    tabButtons.forEach((/** @type {any} */ btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    signInForm?.classList.toggle('hidden', tab !== 'signin');
    signUpForm?.classList.toggle('hidden', tab !== 'signup');
    clearErrors();
  }

  function setLoading(/** @type {any} */ isLoading) {
    root?.classList.toggle('loading', !!isLoading);
    root?.querySelectorAll('input, button, select').forEach((/** @type {any} */ el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement) {
        el.disabled = !!isLoading;
      }
    });
  }

  function setAccount(/** @type {any} */ account) {
    if (accountEl) {
      accountEl.textContent = account?.username ? `Account: ${account.username}` : 'Account: --';
    }
  }

  function setLastCharacter(/** @type {any} */ name) {
    if (lastCharacterEl) {
      lastCharacterEl.textContent = name ? `Last played: ${name}` : 'Last played: --';
    }
  }

  function setCharacters(/** @type {any} */ list) {
    characters = Array.isArray(list) ? list : [];
    if (selectedCharacterId && !characters.find((/** @type {any} */ c) => c.id === selectedCharacterId)) {
      selectedCharacterId = null;
    }
    renderCharacters();
    const selected = characters.find((/** @type {any} */ c) => c.id === selectedCharacterId);
    setLastCharacter(selected?.name ?? null);
  }

  function renderCharacters() {
    if (!characterListEl) return;
    characterListEl.innerHTML = '';
    if (characters.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'character-meta';
      empty.textContent = 'No characters yet. Create one to begin.';
      characterListEl.appendChild(empty);
      return;
    }
    characters.forEach((/** @type {any} */ character) => {
      const row = document.createElement('div');
      row.className = 'character-row';
      if (character.id === selectedCharacterId) {
        row.classList.add('selected');
      }

      const info = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.className = 'character-name';
      nameEl.textContent = character.name ?? 'Unknown';
      const meta = document.createElement('div');
      meta.className = 'character-meta';
      meta.textContent = `${character.classId ?? '--'} · Lv ${character.level ?? 1}`;
      if (character.id === selectedCharacterId) {
        const tag = document.createElement('span');
        tag.className = 'character-tag';
        tag.textContent = 'Last played';
        meta.appendChild(tag);
      }
      info.appendChild(nameEl);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'character-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'menu-primary';
      playBtn.type = 'button';
      playBtn.textContent = 'Play';
      playBtn.addEventListener('click', () => {
        onSelectCharacter?.(character);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'menu-ghost';
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        onDeleteCharacter?.(character);
      });

      row.appendChild(info);
      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(actions);
      characterListEl.appendChild(row);
    });
  }

  function setError(/** @type {any} */ stepKey, /** @type {any} */ message) {
    const el = stepKey === 'characters' ? charactersErrorEl : stepKey === 'create' ? createErrorEl : authErrorEl;
    if (el) {
      el.textContent = message ?? '';
    }
  }

  function clearErrors() {
    if (authErrorEl) authErrorEl.textContent = '';
    if (charactersErrorEl) charactersErrorEl.textContent = '';
    if (createErrorEl) createErrorEl.textContent = '';
  }

  tabButtons.forEach((/** @type {any} */ btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab === 'signup' ? 'signup' : 'signin';
      setTab(next);
    });
  });

  signInForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'auth') return;
    const data = new FormData(signInForm);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    onSignIn?.({ username, password });
  });

  signUpForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'auth') return;
    const data = new FormData(signUpForm);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    onSignUp?.({ username, password });
  });

  createOpenBtn?.addEventListener('click', () => {
    setStep('create');
  });

  createCancelBtn?.addEventListener('click', () => {
    setStep('characters');
  });

  signOutBtn?.addEventListener('click', () => {
    onSignOut?.();
  });

  createForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'create') return;
    const data = new FormData(createForm);
    const name = String(data.get('name') ?? '');
    const classId = String(data.get('classId') ?? '');
    onCreateCharacter?.({ name, classId });
  });

  setTab(tab);
  setStep(step);

  return {
    setOpen,
    setStep,
    setTab,
    setLoading,
    setAccount,
    setSelectedCharacterId: (/** @type {any} */ id) => {
      selectedCharacterId = id ?? null;
      renderCharacters();
      const selected = characters.find((/** @type {any} */ c) => c.id === selectedCharacterId);
      setLastCharacter(selected?.name ?? null);
    },
    setCharacters,
    setError,
    clearErrors,
    getState: () => ({
      open,
      step,
      tab,
      selectedCharacterId,
      characters: characters.map((/** @type {any} */ c) => ({
        id: c.id,
        name: c.name,
        classId: c.classId,
        level: c.level,
      })),
    }),
  };
}
