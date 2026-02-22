// @ts-check
import { CLASSES, getClassById } from '/shared/classes.js';

/**
 * @param {string} username
 */
export function validateUsername(username) {
  const value = String(username ?? '').trim();
  if (!value) return 'Username is required.';
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
    return 'Use 3-20 letters, numbers, or underscore.';
  }
  return '';
}

/**
 * @param {string} password
 */
export function validatePassword(password) {
  const value = String(password ?? '');
  if (!value) return 'Password is required.';
  if (value.length < 8 || value.length > 64) return 'Use 8-64 characters.';
  return '';
}

/**
 * @param {string} name
 */
export function validateCharacterName(name) {
  const value = String(name ?? '').trim();
  if (!value) return 'Character name is required.';
  if (!/^[A-Za-z0-9 ]{3,16}$/.test(value)) {
    return 'Use 3-16 letters, numbers, or spaces.';
  }
  return '';
}

/**
 * @param {any} classId
 */
export function getClassMeta(classId) {
  const klass = getClassById(classId);
  return {
    id: klass.id,
    name: klass.name,
    role: klass.role,
    blurb: klass.blurb,
  };
}

/**
 * @param {any} character
 */
function getCharacterClassText(character) {
  const klass = getClassById(character?.classId);
  return `${klass.name} (${klass.role})`;
}

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
  const progressItems = /** @type {HTMLElement[]} */ (Array.from(root?.querySelectorAll('.menu-progress-step') ?? []));
  const signInForm = /** @type {HTMLFormElement | null} */ (document.getElementById('signin-form'));
  const signUpForm = /** @type {HTMLFormElement | null} */ (document.getElementById('signup-form'));
  const authErrorEl = document.getElementById('menu-auth-error');
  const charactersErrorEl = document.getElementById('menu-characters-error');
  const createErrorEl = document.getElementById('menu-create-error');
  const accountEl = document.getElementById('menu-account');
  const lastCharacterEl = document.getElementById('menu-last-character');
  const statusEl = document.getElementById('menu-status');
  const characterListEl = document.getElementById('character-list');
  const createOpenBtn = document.getElementById('character-create-open');
  const createCancelBtn = document.getElementById('character-create-cancel');
  const signOutBtn = document.getElementById('menu-signout');
  const createForm = /** @type {HTMLFormElement | null} */ (document.getElementById('character-create-form'));
  const continuePanelEl = document.getElementById('menu-continue-panel');
  const continueNameEl = document.getElementById('menu-continue-name');
  const continueMetaEl = document.getElementById('menu-continue-meta');
  const continueBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-continue-btn'));
  const classPreviewNameEl = document.getElementById('character-class-preview-name');
  const classPreviewRoleEl = document.getElementById('character-class-preview-role');
  const classPreviewBlurbEl = document.getElementById('character-class-preview-blurb');
  const classSelectEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('character-class'));

  const fieldErrorEls = {
    signin: {
      username: document.getElementById('signin-username-error'),
      password: document.getElementById('signin-password-error'),
    },
    signup: {
      username: document.getElementById('signup-username-error'),
      password: document.getElementById('signup-password-error'),
    },
    create: {
      name: document.getElementById('character-name-error'),
      classId: document.getElementById('character-class-error'),
    },
  };

  let open = true;
  let step = 'auth';
  let tab = 'signin';
  let /** @type {'account' | 'character' | 'enter'} */ progressStep = 'account';
  let /** @type {any} */ characters = [];
  let /** @type {any} */ selectedCharacterId = null;
  let /** @type {any} */ primaryCharacter = null;
  let statusTone = 'neutral';

  function renderStatus(/** @type {any} */ message, /** @type {any} */ tone = 'neutral') {
    if (!statusEl) return;
    statusEl.textContent = String(message ?? '');
    statusEl.classList.remove('tone-neutral', 'tone-success', 'tone-error');
    const normalizedTone = ['neutral', 'success', 'error'].includes(tone) ? tone : 'neutral';
    statusTone = normalizedTone;
    statusEl.classList.add(`tone-${normalizedTone}`);
  }

  function clearFieldErrors() {
    for (const group of Object.values(fieldErrorEls)) {
      for (const el of Object.values(group)) {
        if (el) el.textContent = '';
      }
    }
  }

  function setFieldError(/** @type {'signin' | 'signup' | 'create'} */ scope, /** @type {'username' | 'password' | 'name' | 'classId'} */ key, /** @type {any} */ message) {
    const scopeGroup = /** @type {Record<string, HTMLElement | null> | undefined} */ (fieldErrorEls[scope]);
    const el = scopeGroup?.[key];
    if (el) {
      el.textContent = String(message ?? '');
    }
  }

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

  function inferProgressFromStep(/** @type {any} */ nextStep) {
    if (nextStep === 'auth') return 'account';
    if (nextStep === 'characters' || nextStep === 'create') return 'character';
    return progressStep;
  }

  function setProgressStep(/** @type {any} */ next) {
    if (next === 'account' || next === 'character' || next === 'enter') {
      progressStep = next;
    }
    if (root) root.dataset.progress = progressStep;
    const order = { account: 0, character: 1, enter: 2 };
    progressItems.forEach((item) => {
      const itemStep = item.dataset.progressStep;
      if (!itemStep || !(itemStep in order)) return;
      const current = order[progressStep] ?? 0;
      const typedStep = /** @type {'account' | 'character' | 'enter'} */ (itemStep);
      const itemOrder = order[typedStep] ?? 0;
      item.classList.toggle('active', itemStep === progressStep);
      item.classList.toggle('complete', itemOrder < current);
    });
  }

  function setStep(/** @type {any} */ next) {
    step = next;
    if (root) root.dataset.step = step;
    setProgressStep(inferProgressFromStep(step));
    clearErrors();
    clearFieldErrors();
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
    clearFieldErrors();
  }

  function setLoading(/** @type {any} */ isLoading) {
    root?.classList.toggle('loading', !!isLoading);
    root?.setAttribute('aria-busy', isLoading ? 'true' : 'false');
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

  function renderPrimaryCharacter() {
    if (!continuePanelEl || !continueBtn) return;
    const hasPrimary = !!primaryCharacter?.id;
    continuePanelEl.classList.toggle('hidden', !hasPrimary);
    if (!hasPrimary) {
      continueBtn.disabled = true;
      if (continueNameEl) continueNameEl.textContent = '--';
      if (continueMetaEl) continueMetaEl.textContent = 'Choose a character from the list below.';
      return;
    }
    continueBtn.disabled = false;
    if (continueNameEl) continueNameEl.textContent = primaryCharacter.name ?? '--';
    if (continueMetaEl) {
      const klass = getClassById(primaryCharacter.classId);
      continueMetaEl.textContent = `${klass.name} (${klass.role}) · Level ${primaryCharacter.level ?? 1}`;
    }
  }

  function setPrimaryCharacter(/** @type {any} */ character) {
    primaryCharacter = character?.id ? character : null;
    renderPrimaryCharacter();
  }

  function setCharacters(/** @type {any} */ list) {
    characters = Array.isArray(list) ? list : [];
    if (selectedCharacterId && !characters.find((/** @type {any} */ c) => c.id === selectedCharacterId)) {
      selectedCharacterId = null;
    }
    const selected = characters.find((/** @type {any} */ c) => c.id === selectedCharacterId) ?? null;
    if (!primaryCharacter?.id || !characters.some((/** @type {any} */ c) => c.id === primaryCharacter.id)) {
      primaryCharacter = selected ?? characters[0] ?? null;
    }
    renderCharacters();
    setLastCharacter(selected?.name ?? null);
    renderPrimaryCharacter();
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
      meta.textContent = `${getCharacterClassText(character)} · Lv ${character.level ?? 1}`;
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

  function hydrateClassOptions() {
    if (!classSelectEl) return;
    const current = classSelectEl.value || 'fighter';
    classSelectEl.innerHTML = '';
    for (const klass of CLASSES) {
      const option = document.createElement('option');
      option.value = klass.id;
      option.textContent = `${klass.name} (${klass.role})`;
      if (klass.id === current) option.selected = true;
      classSelectEl.appendChild(option);
    }
  }

  function updateClassPreview(/** @type {any} */ classId) {
    const meta = getClassMeta(classId || classSelectEl?.value || 'fighter');
    if (classPreviewNameEl) classPreviewNameEl.textContent = meta.name;
    if (classPreviewRoleEl) classPreviewRoleEl.textContent = meta.role;
    if (classPreviewBlurbEl) classPreviewBlurbEl.textContent = meta.blurb;
  }

  tabButtons.forEach((/** @type {any} */ btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab === 'signup' ? 'signup' : 'signin';
      setTab(next);
    });
  });

  continueBtn?.addEventListener('click', () => {
    if (primaryCharacter?.id) {
      onSelectCharacter?.(primaryCharacter);
    }
  });

  signInForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'auth') return;
    clearFieldErrors();
    const data = new FormData(signInForm);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    if (usernameError || passwordError) {
      if (usernameError) setFieldError('signin', 'username', usernameError);
      if (passwordError) setFieldError('signin', 'password', passwordError);
      setError('auth', 'Please fix highlighted fields.');
      return;
    }
    onSignIn?.({ username: username.trim(), password });
  });

  signUpForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'auth') return;
    clearFieldErrors();
    const data = new FormData(signUpForm);
    const username = String(data.get('username') ?? '');
    const password = String(data.get('password') ?? '');
    const usernameError = validateUsername(username);
    const passwordError = validatePassword(password);
    if (usernameError || passwordError) {
      if (usernameError) setFieldError('signup', 'username', usernameError);
      if (passwordError) setFieldError('signup', 'password', passwordError);
      setError('auth', 'Please fix highlighted fields.');
      return;
    }
    onSignUp?.({ username: username.trim(), password });
  });

  createOpenBtn?.addEventListener('click', () => {
    setStep('create');
    updateClassPreview(classSelectEl?.value);
  });

  createCancelBtn?.addEventListener('click', () => {
    setStep('characters');
  });

  signOutBtn?.addEventListener('click', () => {
    onSignOut?.();
  });

  classSelectEl?.addEventListener('change', () => {
    updateClassPreview(classSelectEl.value);
  });

  createForm?.addEventListener('submit', (/** @type {any} */ event) => {
    event.preventDefault();
    if (!open || step !== 'create') return;
    clearFieldErrors();
    const data = new FormData(createForm);
    const name = String(data.get('name') ?? '');
    const classId = String(data.get('classId') ?? '');
    const nameError = validateCharacterName(name);
    const classMeta = CLASSES.find((/** @type {any} */ klass) => klass.id === classId);
    const classError = classMeta ? '' : 'Choose a valid class.';
    if (nameError || classError) {
      if (nameError) setFieldError('create', 'name', nameError);
      if (classError) setFieldError('create', 'classId', classError);
      setError('create', 'Please fix highlighted fields.');
      return;
    }
    onCreateCharacter?.({ name: name.trim(), classId });
  });

  hydrateClassOptions();
  updateClassPreview(classSelectEl?.value);
  setTab(tab);
  setStep(step);
  setProgressStep(progressStep);
  renderStatus('Ready to continue your journey.', 'neutral');

  return {
    setOpen,
    setStep,
    setTab,
    setLoading,
    setAccount,
    setProgressStep,
    setStatusMessage: renderStatus,
    setPrimaryCharacter,
    setSelectedCharacterId: (/** @type {any} */ id) => {
      selectedCharacterId = id ?? null;
      if (selectedCharacterId) {
        const selected = characters.find((/** @type {any} */ c) => c.id === selectedCharacterId) ?? null;
        if (selected) {
          setPrimaryCharacter(selected);
        }
      }
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
      progressStep,
      statusTone,
      selectedCharacterId,
      primaryCharacterId: primaryCharacter?.id ?? null,
      characters: characters.map((/** @type {any} */ c) => ({
        id: c.id,
        name: c.name,
        classId: c.classId,
        level: c.level,
      })),
    }),
  };
}
