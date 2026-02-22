// @ts-check
const ACCOUNT_KEY = 'mmorpg_account';
const LAST_CHARACTER_PREFIX = 'mmorpg_last_character_';

// Auth uses HttpOnly session cookie by default. Token is only stored in memory when the server
// returns it (EXPOSE_AUTH_TOKEN=true, dev/testing only). Never store tokens in localStorage.

/**
 * @typedef {{
 *   method?: string;
 *   body?: unknown;
 * }} ApiFetchOptions
 */

/**
 * @param {unknown} err
 * @param {string} fallback
 */
function mapErrorMessage(err, fallback) {
  const raw = err instanceof Error ? err.message : '';
  const msg = String(raw || fallback);
  const lower = msg.toLowerCase();

  if (lower.includes('invalid username or password')) return 'Incorrect username or password.';
  if (lower.includes('username already taken')) return 'That username is already taken.';
  if (lower.includes('character name already taken')) return 'That character name is already taken.';
  if (lower.includes('too many attempts')) return 'Too many attempts. Please wait and try again.';
  if (lower.includes('unauthorized')) return 'Your session expired. Please sign in again.';
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Network issue detected. Check connection and retry.';
  }
  return msg;
}

export function createAuth(/** @type {any} */ {
  menu,
  ui,
  accountNameEl,
  characterNameEl,
  uiAudio,
}) {
  let /** @type {any} */ onConnectCharacter = null;
  let /** @type {any} */ onDisconnect = null;

  function setOnConnectCharacter(/** @type {any} */ fn) {
    onConnectCharacter = fn;
  }
  function setOnDisconnect(/** @type {any} */ fn) {
    onDisconnect = fn;
  }
  let /** @type {any} */ authToken = null;
  let /** @type {any} */ currentAccount = null;
  let /** @type {any} */ currentCharacter = null;
  let /** @type {any} */ lastCharacterId = null;

  function saveAuthToken(/** @type {any} */ token) {
    authToken = token ?? null;
  }

  function loadStoredAccount() {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string') {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  function saveStoredAccount(/** @type {any} */ account) {
    if (!account || typeof account.id !== 'string') return;
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }

  function clearStoredAccount() {
    localStorage.removeItem(ACCOUNT_KEY);
  }

  function getLastCharacterKey() {
    return currentAccount?.id ? `${LAST_CHARACTER_PREFIX}${currentAccount.id}` : null;
  }

  function loadLastCharacterId() {
    const key = getLastCharacterKey();
    if (!key) return null;
    return localStorage.getItem(key);
  }

  function saveLastCharacterId(/** @type {any} */ id) {
    const key = getLastCharacterKey();
    if (!key) return;
    if (id) {
      localStorage.setItem(key, id);
    }
  }

  function clearLastCharacterId() {
    const key = getLastCharacterKey();
    if (!key) return;
    localStorage.removeItem(key);
  }

  function updateOverlayLabels() {
    if (accountNameEl) {
      accountNameEl.textContent = currentAccount?.username ?? '--';
    }
    const charName = currentCharacter?.name ?? '--';
    if (characterNameEl) {
      characterNameEl.textContent = charName;
    }
    const charSheetName = document.getElementById('character-sheet-name');
    const charSheetCharName = document.getElementById('character-sheet-char-name');
    if (charSheetName) charSheetName.textContent = charName;
    if (charSheetCharName) charSheetCharName.textContent = charName;
  }

  function clearSessionState() {
    saveAuthToken(null);
    clearStoredAccount();
    currentAccount = null;
    currentCharacter = null;
    menu.setPrimaryCharacter?.(null);
    updateOverlayLabels();
  }

  /**
   * @param {string} path
   * @param {ApiFetchOptions} [options]
   */
  async function apiFetch(path, { method = 'GET', body } = {}) {
    /** @type {Record<string, string>} */
    const headers = {};
    if (body) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let /** @type {any} */ payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (!res.ok) {
      throw new Error(payload?.error || 'Request failed');
    }
    return payload;
  }

  async function loadCharacters() {
    const data = await apiFetch('/api/characters');
    const characters = data.characters ?? [];
    menu.setCharacters(characters);
    lastCharacterId = loadLastCharacterId();
    const preferred = characters.find((/** @type {any} */ c) => c.id === lastCharacterId) ?? characters[0] ?? null;
    menu.setSelectedCharacterId(lastCharacterId);
    menu.setPrimaryCharacter(preferred);
    menu.setStep('characters');
    menu.setProgressStep('character');
    menu.setStatusMessage(
      characters.length > 0
        ? 'Choose a character or continue from your last adventure.'
        : 'No characters yet. Create one to enter the world.',
      'neutral'
    );
    menu.setOpen(true);
    ui.setMenuOpen(true);
    updateOverlayLabels();
  }

  async function signIn(/** @type {any} */ { username, password }) {
    menu.setLoading(true);
    menu.setError('auth', '');
    menu.setProgressStep('account');
    menu.setStatusMessage('Signing in...', 'neutral');
    uiAudio?.play?.('confirm');
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      saveAuthToken(data.token ?? null);
      currentAccount = data.account ?? null;
      saveStoredAccount(currentAccount);
      menu.setAccount(currentAccount);
      menu.setStatusMessage('Signed in successfully.', 'success');
      uiAudio?.play?.('success');
      await loadCharacters();
    } catch (err) {
      const msg = mapErrorMessage(err, 'Unable to sign in.');
      menu.setError('auth', msg);
      menu.setStatusMessage(msg, 'error');
      uiAudio?.play?.('error');
    } finally {
      menu.setLoading(false);
    }
  }

  async function signUp(/** @type {any} */ { username, password }) {
    menu.setLoading(true);
    menu.setError('auth', '');
    menu.setProgressStep('account');
    menu.setStatusMessage('Creating account...', 'neutral');
    uiAudio?.play?.('confirm');
    try {
      const data = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: { username, password },
      });
      saveAuthToken(data.token ?? null);
      currentAccount = data.account ?? null;
      saveStoredAccount(currentAccount);
      menu.setAccount(currentAccount);
      menu.setStatusMessage('Account created successfully.', 'success');
      uiAudio?.play?.('success');
      await loadCharacters();
    } catch (err) {
      const msg = mapErrorMessage(err, 'Unable to create account.');
      menu.setError('auth', msg);
      menu.setStatusMessage(msg, 'error');
      uiAudio?.play?.('error');
    } finally {
      menu.setLoading(false);
    }
  }

  async function createCharacter(/** @type {any} */ { name, classId }) {
    menu.setLoading(true);
    menu.setError('create', '');
    menu.setProgressStep('character');
    menu.setStatusMessage('Forging your character...', 'neutral');
    uiAudio?.play?.('confirm');
    try {
      const data = await apiFetch('/api/characters', {
        method: 'POST',
        body: { name, classId },
      });
      const character = data.character;
      if (character) {
        menu.setStatusMessage('Character created. Entering world...', 'success');
        await loadCharacters();
        await connectCharacter(character);
        return;
      }
      menu.setError('create', 'Unable to create character.');
      menu.setStatusMessage('Unable to create character.', 'error');
      uiAudio?.play?.('error');
    } catch (err) {
      const msg = mapErrorMessage(err, 'Unable to create character.');
      menu.setError('create', msg);
      menu.setStatusMessage(msg, 'error');
      uiAudio?.play?.('error');
    } finally {
      menu.setLoading(false);
    }
  }

  async function returnToCharacterSelect() {
    onDisconnect?.();
    currentCharacter = null;
    ui.setStatus?.('menu');
    menu.setProgressStep('character');
    menu.setStatusMessage('Choose your character.', 'neutral');
    try {
      await loadCharacters();
    } catch {
      clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      menu.setProgressStep('account');
      menu.setStatusMessage('Sign in to continue.', 'neutral');
      menu.setOpen(true);
      ui.setMenuOpen(true);
      ui.setStatus?.('menu');
    }
  }

  async function signOut() {
    menu.setLoading(true);
    menu.setStatusMessage('Signing out...', 'neutral');
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    saveAuthToken(null);
    clearStoredAccount();
    lastCharacterId = null;
    clearSessionState();
    onDisconnect?.();
    menu.setAccount(null);
    menu.setCharacters([]);
    menu.setStep('auth');
    menu.setTab('signin');
    menu.setProgressStep('account');
    menu.setStatusMessage('Signed out.', 'neutral');
    menu.setOpen(true);
    ui.setMenuOpen(true);
    ui.setStatus('menu');
    menu.setLoading(false);
  }

  async function deleteCharacter(/** @type {any} */ character) {
    if (!character?.id) return;
    const confirmDelete = window.confirm(`Delete ${character.name ?? 'this character'}? This cannot be undone.`);
    if (!confirmDelete) return;
    menu.setLoading(true);
    menu.setError('characters', '');
    menu.setStatusMessage('Deleting character...', 'neutral');
    try {
      await apiFetch(`/api/characters/${character.id}`, { method: 'DELETE' });
      if (lastCharacterId === character.id) {
        clearLastCharacterId();
        lastCharacterId = null;
        menu.setSelectedCharacterId(null);
      }
      await loadCharacters();
      menu.setStatusMessage('Character deleted.', 'success');
    } catch (err) {
      const msg = mapErrorMessage(err, 'Unable to delete character.');
      menu.setError('characters', msg);
      menu.setStatusMessage(msg, 'error');
      uiAudio?.play?.('error');
    } finally {
      menu.setLoading(false);
    }
  }

  async function connectCharacter(/** @type {any} */ character) {
    if (!character?.id) return;
    menu.setLoading(true);
    menu.setError('characters', '');
    menu.setProgressStep('enter');
    menu.setStatusMessage(`Entering world as ${character.name ?? 'character'}...`, 'neutral');
    uiAudio?.play?.('confirm');
    try {
      currentCharacter = character;
      saveLastCharacterId(character.id);
      lastCharacterId = character.id;
      menu.setSelectedCharacterId(character.id);
      menu.setPrimaryCharacter(character);
      updateOverlayLabels();
      await onConnectCharacter?.(character);
      menu.setOpen(false);
      ui.setMenuOpen(false);
      uiAudio?.play?.('enter_world');
    } catch (err) {
      const msg = mapErrorMessage(err, 'Unable to connect.');
      menu.setError('characters', msg);
      menu.setProgressStep('character');
      menu.setStatusMessage(msg, 'error');
      ui.setMenuOpen(true);
      uiAudio?.play?.('error');
    } finally {
      menu.setLoading(false);
    }
  }

  function initFromStorage() {
    currentAccount = loadStoredAccount();
    menu.setAccount(currentAccount);
    menu.setPrimaryCharacter(null);
    lastCharacterId = currentAccount ? loadLastCharacterId() : null;
    return currentAccount;
  }

  return {
    signIn,
    signUp,
    signOut,
    returnToCharacterSelect,
    createCharacter,
    deleteCharacter,
    connectCharacter,
    loadCharacters,
    getAccount: () => currentAccount,
    getCharacter: () => currentCharacter,
    getAuthToken: () => authToken,
    getLastCharacterId: () => lastCharacterId,
    setCharacter: (/** @type {any} */ c) => { currentCharacter = c; },
    setOnConnectCharacter,
    setOnDisconnect,
    updateOverlayLabels,
    clearSessionState,
    loadStoredAccount,
    initFromStorage,
    setGuestAccount: () => {
      currentAccount = { username: 'Guest' };
      currentCharacter = { name: 'Guest' };
      updateOverlayLabels();
    },
  };
}
