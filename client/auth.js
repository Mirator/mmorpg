const ACCOUNT_KEY = 'mmorpg_account';
const LAST_CHARACTER_PREFIX = 'mmorpg_last_character_';

// Auth uses HttpOnly session cookie by default. Token is only stored in memory when the server
// returns it (EXPOSE_AUTH_TOKEN=true, dev/testing only). Never store tokens in localStorage.

export function createAuth({
  menu,
  ui,
  accountNameEl,
  characterNameEl,
}) {
  let onConnectCharacter = null;
  let onDisconnect = null;

  function setOnConnectCharacter(fn) {
    onConnectCharacter = fn;
  }
  function setOnDisconnect(fn) {
    onDisconnect = fn;
  }
  let authToken = null;
  let currentAccount = null;
  let currentCharacter = null;
  let lastCharacterId = null;

  function saveAuthToken(token) {
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

  function saveStoredAccount(account) {
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

  function saveLastCharacterId(id) {
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
    updateOverlayLabels();
  }

  async function apiFetch(path, { method = 'GET', body } = {}) {
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
    let payload = null;
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
    menu.setCharacters(data.characters ?? []);
    lastCharacterId = loadLastCharacterId();
    menu.setSelectedCharacterId(lastCharacterId);
    menu.setStep('characters');
    menu.setOpen(true);
    ui.setMenuOpen(true);
    updateOverlayLabels();
  }

  async function signIn({ username, password }) {
    menu.setLoading(true);
    menu.setError('auth', '');
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      saveAuthToken(data.token ?? null);
      currentAccount = data.account ?? null;
      saveStoredAccount(currentAccount);
      menu.setAccount(currentAccount);
      await loadCharacters();
    } catch (err) {
      menu.setError('auth', err.message || 'Unable to sign in.');
    } finally {
      menu.setLoading(false);
    }
  }

  async function signUp({ username, password }) {
    menu.setLoading(true);
    menu.setError('auth', '');
    try {
      const data = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: { username, password },
      });
      saveAuthToken(data.token ?? null);
      currentAccount = data.account ?? null;
      saveStoredAccount(currentAccount);
      menu.setAccount(currentAccount);
      await loadCharacters();
    } catch (err) {
      menu.setError('auth', err.message || 'Unable to create account.');
    } finally {
      menu.setLoading(false);
    }
  }

  async function createCharacter({ name, classId }) {
    menu.setLoading(true);
    menu.setError('create', '');
    try {
      const data = await apiFetch('/api/characters', {
        method: 'POST',
        body: { name, classId },
      });
      const character = data.character;
      if (character) {
        await loadCharacters();
        await connectCharacter(character);
        return;
      }
      menu.setError('create', 'Unable to create character.');
    } catch (err) {
      menu.setError('create', err.message || 'Unable to create character.');
    } finally {
      menu.setLoading(false);
    }
  }

  async function returnToCharacterSelect() {
    onDisconnect?.();
    currentCharacter = null;
    ui.setStatus?.('menu');
    try {
      await loadCharacters();
    } catch (err) {
      clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      menu.setOpen(true);
      ui.setMenuOpen(true);
      ui.setStatus?.('menu');
    }
  }

  async function signOut() {
    menu.setLoading(true);
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
    menu.setOpen(true);
    ui.setMenuOpen(true);
    ui.setStatus('menu');
    menu.setLoading(false);
  }

  async function deleteCharacter(character) {
    if (!character?.id) return;
    const confirmDelete = window.confirm(`Delete ${character.name ?? 'this character'}? This cannot be undone.`);
    if (!confirmDelete) return;
    menu.setLoading(true);
    menu.setError('characters', '');
    try {
      await apiFetch(`/api/characters/${character.id}`, { method: 'DELETE' });
      if (lastCharacterId === character.id) {
        clearLastCharacterId();
        lastCharacterId = null;
        menu.setSelectedCharacterId(null);
      }
      await loadCharacters();
    } catch (err) {
      menu.setError('characters', err.message || 'Unable to delete character.');
    } finally {
      menu.setLoading(false);
    }
  }

  async function connectCharacter(character) {
    if (!character?.id) return;
    menu.setLoading(true);
    menu.setError('characters', '');
    try {
      currentCharacter = character;
      saveLastCharacterId(character.id);
      lastCharacterId = character.id;
      menu.setSelectedCharacterId(character.id);
      updateOverlayLabels();
      await onConnectCharacter?.(character);
      menu.setOpen(false);
      ui.setMenuOpen(false);
    } catch (err) {
      menu.setError('characters', err.message || 'Unable to connect.');
      ui.setMenuOpen(true);
    } finally {
      menu.setLoading(false);
    }
  }

  function initFromStorage() {
    currentAccount = loadStoredAccount();
    menu.setAccount(currentAccount);
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
    setCharacter: (c) => { currentCharacter = c; },
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
