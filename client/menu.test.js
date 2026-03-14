import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMenu, getClassMeta, validateCharacterName, validatePassword, validateUsername } from './menu.js';
import { FakeElement, createFakeDocument } from './test/fakeDom.js';

function replaceElement(elements, id, tagName) {
  const el = new FakeElement(tagName);
  el.id = id;
  elements[id] = el;
  return el;
}

function append(parent, child) {
  parent.appendChild(child);
  return child;
}

function createMenuHarness(storageEntries = {}) {
  const ids = [
    'menu',
    'signin-form',
    'signup-form',
    'menu-auth-error',
    'menu-characters-error',
    'menu-create-error',
    'menu-account',
    'menu-last-character',
    'menu-status',
    'character-list',
    'character-create-open',
    'character-create-cancel',
    'menu-signout',
    'character-create-form',
    'menu-continue-panel',
    'menu-continue-name',
    'menu-continue-meta',
    'menu-continue-btn',
    'character-class-preview-name',
    'character-class-preview-role',
    'character-class-preview-blurb',
    'character-class',
    'signin-remember',
    'signup-remember',
    'menu-title-subtitle',
    'menu-current-realm-name',
    'menu-current-realm-meta',
    'menu-nav-list',
    'menu-news-featured',
    'menu-news-list',
    'menu-community-list',
    'menu-footer-realm-name',
    'menu-footer-realm-region',
    'menu-footer-realm-population',
    'menu-footer-realm-status',
    'menu-footer-network-summary',
    'menu-network-refresh',
    'menu-footer-privacy',
    'menu-footer-version',
    'menu-overlay-backdrop',
    'menu-settings-overlay',
    'menu-credits-overlay',
    'menu-realms-overlay',
    'menu-settings-motion',
    'menu-settings-parallax',
    'menu-settings-foliage',
    'menu-realms-list',
    'menu-credits-summary',
    'menu-credits-details',
    'menu-credits-icons',
    'menu-pollen',
    'signin-username-error',
    'signin-password-error',
    'signup-username-error',
    'signup-password-error',
    'character-name-error',
    'character-class-error',
  ];
  const fake = createFakeDocument(ids);
  const { elements, document } = fake;
  const root = replaceElement(elements, 'menu', 'div');
  root.className = 'menu open';
  root.dataset.step = 'auth';
  root.dataset.tab = 'signin';
  root.dataset.progress = 'account';

  const signInForm = replaceElement(elements, 'signin-form', 'form');
  signInForm.className = 'menu-form';
  const signUpForm = replaceElement(elements, 'signup-form', 'form');
  signUpForm.className = 'menu-form hidden';
  const createForm = replaceElement(elements, 'character-create-form', 'form');
  createForm.className = 'menu-form';
  replaceElement(elements, 'character-class', 'select');
  replaceElement(elements, 'signin-remember', 'input').checked = true;
  replaceElement(elements, 'signup-remember', 'input').checked = true;
  replaceElement(elements, 'menu-network-refresh', 'button');
  replaceElement(elements, 'menu-settings-motion', 'input').checked = true;
  replaceElement(elements, 'menu-settings-parallax', 'input').checked = true;
  replaceElement(elements, 'menu-settings-foliage', 'input').checked = true;
  replaceElement(elements, 'character-create-open', 'button');
  replaceElement(elements, 'character-create-cancel', 'button');
  replaceElement(elements, 'menu-signout', 'button');
  replaceElement(elements, 'menu-continue-btn', 'button');

  const progress = append(root, new FakeElement('div'));
  progress.className = 'menu-progress';
  ['account', 'character', 'enter'].forEach((step) => {
    const item = append(progress, new FakeElement('div'));
    item.className = 'menu-progress-step';
    item.dataset.progressStep = step;
  });

  const signInTab = append(root, new FakeElement('button'));
  signInTab.className = 'menu-tab active';
  signInTab.dataset.tab = 'signin';
  const signUpTab = append(root, new FakeElement('button'));
  signUpTab.className = 'menu-tab';
  signUpTab.dataset.tab = 'signup';

  append(root, signInForm);
  append(root, signUpForm);
  append(root, elements['character-create-form']);
  append(root, elements['menu-auth-error']);
  append(root, elements['menu-characters-error']);
  append(root, elements['menu-create-error']);
  append(root, elements['menu-account']);
  append(root, elements['menu-last-character']);
  append(root, elements['menu-status']);
  append(root, elements['character-list']);
  append(root, elements['character-create-open']);
  append(root, elements['character-create-cancel']);
  append(root, elements['menu-signout']);
  append(root, elements['menu-continue-panel']);
  append(root, elements['menu-continue-name']);
  append(root, elements['menu-continue-meta']);
  append(root, elements['menu-continue-btn']);
  append(root, elements['character-class-preview-name']);
  append(root, elements['character-class-preview-role']);
  append(root, elements['character-class-preview-blurb']);
  append(root, elements['character-class']);
  append(root, elements['menu-title-subtitle']);
  append(root, elements['menu-current-realm-name']);
  append(root, elements['menu-current-realm-meta']);
  append(root, elements['menu-nav-list']);
  append(root, elements['menu-news-featured']);
  append(root, elements['menu-news-list']);
  append(root, elements['menu-community-list']);
  append(root, elements['menu-footer-realm-name']);
  append(root, elements['menu-footer-realm-region']);
  append(root, elements['menu-footer-realm-population']);
  append(root, elements['menu-footer-realm-status']);
  append(root, elements['menu-footer-network-summary']);
  append(root, elements['menu-network-refresh']);
  append(root, elements['menu-footer-privacy']);
  append(root, elements['menu-footer-version']);
  append(root, elements['menu-overlay-backdrop']);
  append(root, elements['menu-settings-overlay']);
  append(root, elements['menu-credits-overlay']);
  append(root, elements['menu-realms-overlay']);
  append(root, elements['menu-settings-motion']);
  append(root, elements['menu-settings-parallax']);
  append(root, elements['menu-settings-foliage']);
  append(root, elements['menu-realms-list']);
  append(root, elements['menu-credits-summary']);
  append(root, elements['menu-credits-details']);
  append(root, elements['menu-credits-icons']);
  append(root, elements['menu-pollen']);
  append(root, elements['signin-username-error']);
  append(root, elements['signin-password-error']);
  append(root, elements['signup-username-error']);
  append(root, elements['signup-password-error']);
  append(root, elements['character-name-error']);
  append(root, elements['character-class-error']);

  const forgot1 = append(root, new FakeElement('button'));
  forgot1.className = 'menu-forgot-link';
  const forgot2 = append(root, new FakeElement('button'));
  forgot2.className = 'menu-forgot-link';

  const realmAnchor1 = append(root, new FakeElement('span'));
  realmAnchor1.className = 'menu-tooltip-anchor menu-realm-button-anchor';
  const realmButton1 = append(realmAnchor1, new FakeElement('button'));
  realmButton1.className = 'menu-realm-button';
  const realmText1 = append(realmButton1, new FakeElement('span'));
  realmText1.className = 'menu-realm-button-text';
  const realmAnchor2 = append(root, new FakeElement('span'));
  realmAnchor2.className = 'menu-tooltip-anchor menu-realm-button-anchor';
  const realmButton2 = append(realmAnchor2, new FakeElement('button'));
  realmButton2.className = 'menu-realm-button';
  const realmText2 = append(realmButton2, new FakeElement('span'));
  realmText2.className = 'menu-realm-button-text';

  for (let index = 0; index < 3; index += 1) {
    const closeBtn = append(root, new FakeElement('button'));
    closeBtn.className = 'menu-overlay-close';
  }

  document.body.appendChild(root);

  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;
  global.document = document;
  const storage = new Map(Object.entries(storageEntries));
  global.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    open: vi.fn(),
    close: vi.fn(),
    matchMedia: () => ({ matches: false }),
    innerWidth: 1280,
    innerHeight: 720,
  };

  return {
    elements,
    storage,
    root,
    restore() {
      global.document = originalDocument;
      global.window = originalWindow;
      global.localStorage = originalLocalStorage;
    },
  };
}

function findNavButton(navListEl, actionId) {
  return navListEl.children.find((child) => child.dataset?.action === actionId);
}

describe('menu validation and class metadata', () => {
  it('validates username rules', () => {
    expect(validateUsername('')).toContain('required');
    expect(validateUsername('ab')).toContain('3-20');
    expect(validateUsername('name!')).toContain('3-20');
    expect(validateUsername('valid_name')).toBe('');
  });

  it('validates password rules', () => {
    expect(validatePassword('')).toContain('required');
    expect(validatePassword('short')).toContain('8-64');
    expect(validatePassword('long-enough-password')).toBe('');
  });

  it('validates character names', () => {
    expect(validateCharacterName('')).toContain('required');
    expect(validateCharacterName('A')).toContain('3-16');
    expect(validateCharacterName('Bad*Name')).toContain('3-16');
    expect(validateCharacterName('Knight 01')).toBe('');
  });

  it('returns class metadata for preview cards', () => {
    const fighter = getClassMeta('fighter');
    expect(fighter.name).toBe('Fighter');
    expect(fighter.role).toBe('Melee DPS');
    expect(fighter.blurb.length).toBeGreaterThan(3);
  });
});

describe('storybook menu state', () => {
  let harness;

  beforeEach(() => {
    harness = createMenuHarness({
      'rising-ages-menu-realm': 'hearthlight-hollow',
    });
  });

  afterEach(() => {
    harness.restore();
  });

  it('tracks remember-account and overlay state', async () => {
    const menu = createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    menu.setRememberAccount(false);
    menu.openOverlay('settings');
    await Promise.resolve();

    expect(menu.getState().rememberAccount).toBe(false);
    expect(harness.elements['signin-remember'].checked).toBe(false);
    expect(harness.elements['signup-remember'].checked).toBe(false);
    expect(menu.getState().overlayState).toBe('settings');
  });

  it('persists selected realm changes through the menu api', () => {
    const menu = createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    menu.setSelectedRealmId('hearthlight-hollow');

    expect(menu.getState().selectedRealmId).toBe('hearthlight-hollow');
    expect(harness.storage.get('rising-ages-menu-realm')).toBe('hearthlight-hollow');
    expect(harness.elements['menu-footer-realm-name'].textContent).toContain('Hearthlight');
  });

  it('disables realm switching and exposes a tooltip when only one realm is enabled', () => {
    createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    const realmButtons = harness.root.querySelectorAll('.menu-realm-button');
    expect(realmButtons).toHaveLength(2);
    realmButtons.forEach((button) => {
      expect(button.disabled).toBe(true);
      expect(button.classList.contains('disabled')).toBe(true);
      expect(button.closest('.menu-tooltip-anchor')?.dataset.tooltip).toContain('Only one realm');
    });
  });

  it('keeps the last-played badge on the remembered character instead of the current selection', () => {
    const menu = createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    menu.setCharacters([
      { id: 'a', name: 'Miratorek', classId: 'fighter', level: 12 },
      { id: 'b', name: 'Hearthwarden', classId: 'guardian', level: 8 },
    ]);
    menu.setLastPlayedCharacterId('a');
    menu.setSelectedCharacterId('b');

    const rows = harness.elements['character-list'].children;
    expect(rows[0].querySelector('.character-name')?.textContent).toContain('Miratorek');
    expect(rows[0].querySelector('.character-tag')?.textContent).toContain('Last played');
    expect(rows[1].querySelector('.character-name')?.textContent).toContain('Hearthwarden');
    expect(rows[1].querySelector('.character-tag')).toBeNull();
  });

  it('hides continue adventure until at least one character exists', () => {
    const menu = createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    const continuePanel = harness.elements['menu-continue-panel'];

    menu.setCharacters([]);
    expect(continuePanel.classList.contains('hidden')).toBe(true);
    expect(harness.elements['menu-continue-btn'].disabled).toBe(true);

    menu.setCharacters([{ id: 'a', name: 'Miratorek', classId: 'fighter', level: 12 }]);
    expect(continuePanel.classList.contains('hidden')).toBe(false);
    expect(harness.elements['menu-continue-btn'].disabled).toBe(false);
  });

  it('renders left-rail fallback behavior for language and exit actions', () => {
    const menu = createMenu({
      networkProbe: async () => ({ state: 'online', label: 'Reachable', latencyMs: 12, checkedAt: 1000 }),
    });

    const languageBtn = findNavButton(harness.elements['menu-nav-list'], 'language');
    languageBtn.listeners.click();
    expect(harness.elements['menu-status'].textContent).toContain('Only English');

    const exitBtn = findNavButton(harness.elements['menu-nav-list'], 'exit');
    exitBtn.listeners.click();
    expect(harness.elements['menu-status'].textContent).toContain('Close this tab');
    expect(global.window.close).toHaveBeenCalled();

    expect(menu.getState().overlayState).toBeNull();
  });
});
