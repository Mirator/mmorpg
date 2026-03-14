// @ts-check
import { CLASSES, getClassById } from '/shared/classes.js';
import {
  LANDING_CONTENT,
  getRealmById,
  loadMenuSceneSettings,
  loadSelectedRealmId,
  saveMenuSceneSettings,
  saveSelectedRealmId,
} from './landingContent.js';
import { probeMenuNetwork, formatMenuNetworkSummary } from './menuNetwork.js';
import { GAME_ICON_CREDITS, formatGameIconLabel } from './gameIcons.js';

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

/**
 * @param {Element | null | undefined} element
 */
function isInputLike(element) {
  const tagName = String(element?.tagName ?? '').toLowerCase();
  return tagName === 'input' || tagName === 'select' || tagName === 'button' || tagName === 'textarea';
}

function getReduceMotionPreference() {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

/**
 * @param {any} root
 */
function getInteractiveControls(root) {
  return [
    ...(root?.querySelectorAll?.('input') ?? []),
    ...(root?.querySelectorAll?.('button') ?? []),
    ...(root?.querySelectorAll?.('select') ?? []),
    ...(root?.querySelectorAll?.('textarea') ?? []),
  ].filter(isInputLike);
}

/**
 * @param {string} href
 */
function openExternalLink(href) {
  if (!href) return false;
  try {
    window.open?.(href, '_blank', 'noopener,noreferrer');
    return true;
  } catch {
    return false;
  }
}

export function createMenu(/** @type {any} */ {
  onSignIn,
  onSignUp,
  onSelectCharacter,
  onCreateCharacter,
  onDeleteCharacter,
  onSignOut,
  networkProbe = probeMenuNetwork,
} = {}) {
  const root = document.getElementById('menu');
  const tabButtons = /** @type {HTMLButtonElement[]} */ (Array.from(root?.querySelectorAll?.('.menu-tab') ?? []));
  const progressItems = /** @type {HTMLElement[]} */ (Array.from(root?.querySelectorAll?.('.menu-progress-step') ?? []));
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
  const signInRememberEl = /** @type {HTMLInputElement | null} */ (document.getElementById('signin-remember'));
  const signUpRememberEl = /** @type {HTMLInputElement | null} */ (document.getElementById('signup-remember'));
  const forgotButtons = /** @type {HTMLButtonElement[]} */ (Array.from(root?.querySelectorAll?.('.menu-forgot-link') ?? []));
  const realmButtons = /** @type {HTMLButtonElement[]} */ (Array.from(root?.querySelectorAll?.('.menu-realm-button') ?? []));
  const titleSubtitleEl = document.getElementById('menu-title-subtitle');
  const currentRealmNameEl = document.getElementById('menu-current-realm-name');
  const currentRealmMetaEl = document.getElementById('menu-current-realm-meta');
  const navListEl = document.getElementById('menu-nav-list');
  const featuredNewsEl = document.getElementById('menu-news-featured');
  const newsListEl = document.getElementById('menu-news-list');
  const communityListEl = document.getElementById('menu-community-list');
  const footerRealmNameEl = document.getElementById('menu-footer-realm-name');
  const footerRealmRegionEl = document.getElementById('menu-footer-realm-region');
  const footerRealmPopulationEl = document.getElementById('menu-footer-realm-population');
  const footerRealmStatusEl = document.getElementById('menu-footer-realm-status');
  const footerNetworkSummaryEl = document.getElementById('menu-footer-network-summary');
  const footerRefreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('menu-network-refresh'));
  const footerPrivacyEl = document.getElementById('menu-footer-privacy');
  const footerVersionEl = document.getElementById('menu-footer-version');
  const overlayBackdropEl = document.getElementById('menu-overlay-backdrop');
  const settingsOverlayEl = document.getElementById('menu-settings-overlay');
  const creditsOverlayEl = document.getElementById('menu-credits-overlay');
  const realmsOverlayEl = document.getElementById('menu-realms-overlay');
  const overlayCloseButtons = /** @type {HTMLButtonElement[]} */ (Array.from(root?.querySelectorAll?.('.menu-overlay-close') ?? []));
  const settingsMotionEl = /** @type {HTMLInputElement | null} */ (document.getElementById('menu-settings-motion'));
  const settingsParallaxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('menu-settings-parallax'));
  const settingsFoliageEl = /** @type {HTMLInputElement | null} */ (document.getElementById('menu-settings-foliage'));
  const realmsListEl = document.getElementById('menu-realms-list');
  const creditsSummaryEl = document.getElementById('menu-credits-summary');
  const creditsDetailsEl = document.getElementById('menu-credits-details');
  const creditsIconsEl = document.getElementById('menu-credits-icons');
  const pollenEl = document.getElementById('menu-pollen');

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
  let /** @type {any[]} */ characters = [];
  let /** @type {string | null} */ selectedCharacterId = null;
  let /** @type {string | null} */ lastPlayedCharacterId = null;
  let /** @type {any} */ primaryCharacter = null;
  let statusTone = 'neutral';
  let rememberAccount = true;
  let selectedRealmId = loadSelectedRealmId();
  let /** @type {'settings' | 'credits' | 'realms' | null} */ overlayState = null;
  let networkState = /** @type {import('./menuNetwork.js').MenuNetworkSnapshot | null} */ (null);
  let networkRefreshPending = false;
  let highlightedNewsId = LANDING_CONTENT.news.find((item) => item.featured)?.id ?? LANDING_CONTENT.news[0]?.id ?? null;
  let localeIndex = 0;
  let sceneSettings = loadMenuSceneSettings();
  let removeSpotlightTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  const reduceMotion = getReduceMotionPreference();
  const realmSwitchAvailable = LANDING_CONTENT.realms.filter((realm) => realm.enabled).length > 1;

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

  function clearErrors() {
    if (authErrorEl) authErrorEl.textContent = '';
    if (charactersErrorEl) charactersErrorEl.textContent = '';
    if (createErrorEl) createErrorEl.textContent = '';
  }

  /**
   * @param {'settings' | 'credits' | 'realms' | null | undefined} next
   */
  function setOverlayState(next) {
    overlayState = next === 'settings' || next === 'credits' || next === 'realms' ? next : null;
    if (root) root.dataset.overlay = overlayState ?? 'none';
    overlayBackdropEl?.classList.toggle('hidden', !overlayState);
    settingsOverlayEl?.classList.toggle('hidden', overlayState !== 'settings');
    creditsOverlayEl?.classList.toggle('hidden', overlayState !== 'credits');
    realmsOverlayEl?.classList.toggle('hidden', overlayState !== 'realms');
  }

  function setOpen(/** @type {any} */ next) {
    open = !!next;
    root?.classList.toggle('open', open);
    if (root?.toggleAttribute) {
      root.toggleAttribute('inert', !open);
    }
    if (!open) {
      setOverlayState(null);
      const active = document.activeElement;
      if (typeof HTMLElement === 'function' && active instanceof HTMLElement && root?.contains?.(active)) {
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

  function renderTitleCopy() {
    if (!titleSubtitleEl) return;
    if (step === 'characters') {
      titleSubtitleEl.textContent = LANDING_CONTENT.characterSubtitle;
      return;
    }
    if (step === 'create') {
      titleSubtitleEl.textContent = LANDING_CONTENT.createSubtitle;
      return;
    }
    titleSubtitleEl.textContent = LANDING_CONTENT.authSubtitle;
  }

  function setStep(/** @type {any} */ next) {
    step = next;
    if (root) root.dataset.step = step;
    setProgressStep(inferProgressFromStep(step));
    clearErrors();
    clearFieldErrors();
    renderTitleCopy();
  }

  function setTab(/** @type {any} */ next) {
    tab = next;
    if (root) root.dataset.tab = tab;
    tabButtons.forEach((btn) => {
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
    getInteractiveControls(root).forEach((el) => {
      el.disabled = !!isLoading;
    });
  }

  function setAccount(/** @type {any} */ account) {
    if (accountEl) {
      accountEl.textContent = account?.username ? `Account: ${account.username}` : 'Account: --';
    }
  }

  function setLastPlayedCharacterId(/** @type {string | null} */ id) {
    lastPlayedCharacterId = id ?? null;
    const lastPlayed = characters.find((character) => character.id === lastPlayedCharacterId) ?? null;
    if (lastCharacterEl) {
      lastCharacterEl.textContent = lastPlayed?.name ? `Last played: ${lastPlayed.name}` : 'Last played: --';
    }
    renderCharacters();
  }

  /**
   * @param {boolean | undefined | null} next
   */
  function setRememberAccount(next) {
    rememberAccount = next !== false;
    if (signInRememberEl) signInRememberEl.checked = rememberAccount;
    if (signUpRememberEl) signUpRememberEl.checked = rememberAccount;
  }

  function getRememberAccount() {
    return rememberAccount;
  }

  function getSelectedRealm() {
    return getRealmById(selectedRealmId) ?? getRealmById(loadSelectedRealmId());
  }

  function renderFooterLinks() {
    if (!footerPrivacyEl) return;
    footerPrivacyEl.innerHTML = '';
    if (LANDING_CONTENT.privacyHref) {
      const link = document.createElement('a');
      link.href = LANDING_CONTENT.privacyHref;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = 'Privacy policy';
      footerPrivacyEl.appendChild(link);
      return;
    }
    const span = document.createElement('span');
    span.className = 'menu-footer-disabled';
    span.textContent = 'Privacy policy coming with account services';
    footerPrivacyEl.appendChild(span);
  }

  function renderRealmSummary() {
    const realm = getSelectedRealm();
    if (!realm) return;
    if (currentRealmNameEl) currentRealmNameEl.textContent = realm.name;
    if (currentRealmMetaEl) currentRealmMetaEl.textContent = `${realm.region} · ${realm.population}`;
    if (footerRealmNameEl) footerRealmNameEl.textContent = realm.name;
    if (footerRealmRegionEl) footerRealmRegionEl.textContent = realm.region;
    if (footerRealmPopulationEl) footerRealmPopulationEl.textContent = realm.population;
    if (footerRealmStatusEl) {
      footerRealmStatusEl.textContent = networkState?.label ?? realm.status;
      footerRealmStatusEl.dataset.state = networkState?.state ?? realm.state;
    }
    realmButtons.forEach((button) => {
      button.disabled = !realmSwitchAvailable;
      button.classList.toggle('disabled', !realmSwitchAvailable);
      button.setAttribute('aria-disabled', realmSwitchAvailable ? 'false' : 'true');
      const anchor = /** @type {HTMLElement | null} */ (button.closest?.('.menu-tooltip-anchor') ?? null);
      if (anchor) {
        if (realmSwitchAvailable) {
          delete anchor.dataset.tooltip;
          anchor.setAttribute('aria-label', '');
        } else {
          anchor.dataset.tooltip = 'Only one realm is available right now.';
          anchor.setAttribute('aria-label', 'Only one realm is available right now.');
        }
      }
      button.dataset.realmName = realm.name;
      const textEl = button.querySelector?.('.menu-realm-button-text') ?? button;
      if (textEl) textEl.textContent = realm.name;
    });
  }

  function setSelectedRealmId(/** @type {string} */ nextRealmId, /** @type {{ persist?: boolean, announce?: boolean }} */ options = {}) {
    const persist = options.persist !== false;
    const announce = options.announce !== false;
    selectedRealmId = persist ? saveSelectedRealmId(nextRealmId) : nextRealmId;
    renderRealmSummary();
    renderRealmChoices();
    if (announce) {
      renderStatus(`Realm set to ${getSelectedRealm()?.name ?? 'the forest watch'}.`, 'neutral');
    }
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

  function renderPrimaryCharacter() {
    if (!continuePanelEl || !continueBtn) return;

    // Ensure we always have a sensible primary character when characters exist.
    if ((!primaryCharacter?.id || !characters.some((c) => c.id === primaryCharacter.id)) && characters.length > 0) {
      const byLastPlayed =
        characters.find((character) => character.id === lastPlayedCharacterId) ?? characters[0] ?? null;
      primaryCharacter = byLastPlayed;
    }

    const hasPrimary = !!primaryCharacter?.id;

    // Hide the continue panel when there is no character to resume.
    continuePanelEl.classList.toggle('hidden', !hasPrimary);
    continueBtn.disabled = !hasPrimary;
    if (!hasPrimary) {
      if (continueNameEl) continueNameEl.textContent = '--';
      if (continueMetaEl) continueMetaEl.textContent = 'Choose a character from the list below.';
      return;
    }

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

    characters.forEach((character) => {
      const row = document.createElement('div');
      row.className = 'character-row';
      if (character.id === selectedCharacterId) {
        row.classList.add('selected');
      }

      const info = document.createElement('div');
      info.className = 'character-copy';
      const nameEl = document.createElement('div');
      nameEl.className = 'character-name';
      nameEl.textContent = character.name ?? 'Unknown';
      const meta = document.createElement('div');
      meta.className = 'character-meta';
      meta.textContent = `${getCharacterClassText(character)} · Lv ${character.level ?? 1}`;
      if (character.id === lastPlayedCharacterId) {
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

      row.addEventListener('click', () => {
        setSelectedCharacterId(character.id ?? null);
        renderStatus(`Ready to continue as ${character.name ?? 'this character'}.`, 'neutral');
      });

      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);
      row.appendChild(info);
      row.appendChild(actions);
      characterListEl.appendChild(row);
    });
  }

  function setCharacters(/** @type {any} */ list) {
    characters = Array.isArray(list) ? list : [];
    if (selectedCharacterId && !characters.find((character) => character.id === selectedCharacterId)) {
      selectedCharacterId = null;
    }
    const selected = characters.find((character) => character.id === selectedCharacterId) ?? null;
    if (!primaryCharacter?.id || !characters.some((character) => character.id === primaryCharacter.id)) {
      primaryCharacter = selected ?? characters[0] ?? null;
    }
    renderCharacters();
    renderPrimaryCharacter();
  }

  function setSelectedCharacterId(/** @type {string | null} */ id) {
    selectedCharacterId = id ?? null;
    if (selectedCharacterId) {
      const selected = characters.find((character) => character.id === selectedCharacterId) ?? null;
      if (selected) {
        setPrimaryCharacter(selected);
      }
    }
    renderCharacters();
  }

  function setError(/** @type {'auth' | 'characters' | 'create'} */ stepKey, /** @type {any} */ message) {
    const el = stepKey === 'characters' ? charactersErrorEl : stepKey === 'create' ? createErrorEl : authErrorEl;
    if (el) {
      el.textContent = message ?? '';
    }
  }

  function renderFeaturedNews(spotlight = false) {
    if (!featuredNewsEl) return;
    const item = LANDING_CONTENT.news.find((entry) => entry.id === highlightedNewsId) ?? LANDING_CONTENT.news[0] ?? null;
    featuredNewsEl.innerHTML = '';
    if (!item) return;

    const kicker = document.createElement('div');
    kicker.className = 'menu-news-kicker';
    kicker.textContent = item.kicker;
    const title = document.createElement('div');
    title.className = 'menu-news-title';
    title.textContent = item.title;
    const body = document.createElement('div');
    body.className = 'menu-news-body';
    body.textContent = item.body;
    const stamp = document.createElement('div');
    stamp.className = 'menu-news-stamp';
    stamp.textContent = item.stamp;
    featuredNewsEl.appendChild(kicker);
    featuredNewsEl.appendChild(title);
    featuredNewsEl.appendChild(body);
    featuredNewsEl.appendChild(stamp);
    featuredNewsEl.classList.toggle('spotlit', spotlight);
  }

  function renderNewsList() {
    if (!newsListEl) return;
    newsListEl.innerHTML = '';
    LANDING_CONTENT.news.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-news-item';
      if (item.id === highlightedNewsId) {
        button.classList.add('active');
      }

      const title = document.createElement('span');
      title.className = 'menu-news-item-title';
      title.textContent = item.title;
      const stamp = document.createElement('span');
      stamp.className = 'menu-news-item-stamp';
      stamp.textContent = item.stamp;
      button.appendChild(title);
      button.appendChild(stamp);
      button.addEventListener('click', () => {
        highlightedNewsId = item.id;
        renderFeaturedNews();
        renderNewsList();
      });
      newsListEl.appendChild(button);
    });
  }

  function focusFeaturedNews() {
    highlightedNewsId = LANDING_CONTENT.news.find((item) => item.featured)?.id ?? LANDING_CONTENT.news[0]?.id ?? highlightedNewsId;
    if (removeSpotlightTimer) clearTimeout(removeSpotlightTimer);
    renderFeaturedNews(true);
    renderNewsList();
    removeSpotlightTimer = setTimeout(() => {
      featuredNewsEl?.classList.remove('spotlit');
    }, 1300);
    renderStatus('The featured chronicle is marked on the right-hand board.', 'neutral');
  }

  function renderCommunity() {
    if (!communityListEl) return;
    communityListEl.innerHTML = '';
    LANDING_CONTENT.community.forEach((entry) => {
      const row = /** @type {HTMLAnchorElement | HTMLSpanElement} */ (
        document.createElement(entry.href ? 'a' : 'span')
      );
      row.className = 'menu-community-link';
      if (!entry.href) row.classList.add('disabled');
      if (entry.href) {
        const linkRow = /** @type {HTMLAnchorElement} */ (row);
        linkRow.href = entry.href;
        linkRow.target = '_blank';
        linkRow.rel = 'noreferrer noopener';
      }
      const label = document.createElement('span');
      label.className = 'menu-community-label';
      label.textContent = entry.label;
      const meta = document.createElement('span');
      meta.className = 'menu-community-meta';
      meta.textContent = entry.meta;
      row.appendChild(label);
      row.appendChild(meta);
      communityListEl.appendChild(row);
    });
  }

  function handleNavAction(/** @type {string} */ actionId) {
    if (actionId === 'plan') {
      focusFeaturedNews();
      return;
    }
    if (actionId === 'create-account') {
      if (step === 'auth') {
        setTab('signup');
        renderStatus('Account creation is ready at center stage.', 'neutral');
        return;
      }
      setStep('create');
      updateClassPreview(classSelectEl?.value);
      renderStatus('Choose a class and name your new wanderer.', 'neutral');
      return;
    }
    if (actionId === 'settings') {
      setOverlayState('settings');
      return;
    }
    if (actionId === 'language') {
      localeIndex = (localeIndex + 1) % LANDING_CONTENT.locales.length;
      const locale = LANDING_CONTENT.locales[localeIndex];
      if (LANDING_CONTENT.locales.length <= 1) {
        renderStatus('Only English is available in this build.', 'neutral');
        return;
      }
      renderStatus(`Language switched to ${locale.label}.`, 'success');
      return;
    }
    if (actionId === 'credits') {
      setOverlayState('credits');
      return;
    }
    if (actionId === 'feedback') {
      if (!LANDING_CONTENT.feedbackHref) {
        renderStatus('Feedback letters are not configured yet.', 'neutral');
        return;
      }
      openExternalLink(LANDING_CONTENT.feedbackHref);
      return;
    }
    if (actionId === 'exit') {
      try {
        window.close?.();
      } catch {
        /* ignore close failure */
      }
      renderStatus('Close this tab to leave the shrine.', 'neutral');
    }
  }

  function renderNav() {
    if (!navListEl) return;
    navListEl.innerHTML = '';
    LANDING_CONTENT.navigation.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-nav-button';
      button.dataset.action = item.id;
      button.textContent = item.label;
      if (item.id === 'feedback' && !LANDING_CONTENT.feedbackHref) {
        button.disabled = true;
        button.classList.add('disabled');
      }
      button.addEventListener('click', () => handleNavAction(item.id));
      navListEl.appendChild(button);
    });
  }

  function renderCredits() {
    if (creditsSummaryEl) creditsSummaryEl.textContent = LANDING_CONTENT.credits.summary;
    if (creditsDetailsEl) {
      creditsDetailsEl.innerHTML = '';
      LANDING_CONTENT.credits.details.forEach((detail) => {
        const li = document.createElement('li');
        li.textContent = detail;
        creditsDetailsEl.appendChild(li);
      });
      const attribution = document.createElement('li');
      attribution.textContent = `${GAME_ICON_CREDITS.statement} under ${GAME_ICON_CREDITS.licenseName}.`;
      creditsDetailsEl.appendChild(attribution);
    }
    if (creditsIconsEl) {
      creditsIconsEl.innerHTML = '';
      const previewIcons = GAME_ICON_CREDITS.usedFiles.slice(0, 10);
      previewIcons.forEach((file) => {
        const li = document.createElement('li');
        li.textContent = formatGameIconLabel(file);
        creditsIconsEl.appendChild(li);
      });
      if (GAME_ICON_CREDITS.usedFiles.length > previewIcons.length) {
        const li = document.createElement('li');
        li.textContent = `and ${GAME_ICON_CREDITS.usedFiles.length - previewIcons.length} more gameplay icons`;
        creditsIconsEl.appendChild(li);
      }
    }
  }

  function renderRealmChoices() {
    if (!realmsListEl) return;
    realmsListEl.innerHTML = '';
    LANDING_CONTENT.realms.forEach((realm) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'menu-realm-choice';
      button.dataset.realmId = realm.id;
      if (realm.id === selectedRealmId) button.classList.add('active');
      if (!realm.enabled) button.classList.add('locked');
      button.disabled = !realm.enabled;

      const name = document.createElement('span');
      name.className = 'menu-realm-choice-name';
      name.textContent = realm.name;
      const meta = document.createElement('span');
      meta.className = 'menu-realm-choice-meta';
      meta.textContent = `${realm.region} · ${realm.population}`;
      const blurb = document.createElement('span');
      blurb.className = 'menu-realm-choice-blurb';
      blurb.textContent = realm.blurb;
      button.appendChild(name);
      button.appendChild(meta);
      button.appendChild(blurb);
      button.addEventListener('click', () => {
        setSelectedRealmId(realm.id);
        setOverlayState(null);
      });
      realmsListEl.appendChild(button);
    });
  }

  function applySceneSettings() {
    const motionEnabled = sceneSettings.motionEnabled && !reduceMotion;
    const parallaxEnabled = sceneSettings.parallaxEnabled && !reduceMotion;
    if (root) {
      root.dataset.motion = motionEnabled ? 'on' : 'off';
      root.dataset.parallax = parallaxEnabled ? 'on' : 'off';
      root.dataset.foliage = sceneSettings.lushFoliage ? 'lush' : 'trim';
    }
    if (settingsMotionEl) settingsMotionEl.checked = sceneSettings.motionEnabled;
    if (settingsParallaxEl) settingsParallaxEl.checked = sceneSettings.parallaxEnabled;
    if (settingsFoliageEl) settingsFoliageEl.checked = sceneSettings.lushFoliage;
    if (!parallaxEnabled && root) {
      root.style.setProperty('--menu-parallax-x', '0px');
      root.style.setProperty('--menu-parallax-y', '0px');
      root.style.setProperty('--menu-foreground-x', '0px');
      root.style.setProperty('--menu-foreground-y', '0px');
    }
  }

  function persistSceneSettings() {
    sceneSettings = saveMenuSceneSettings(sceneSettings);
    applySceneSettings();
  }

  function populatePollen() {
    if (!pollenEl || pollenEl.children.length > 0) return;
    for (let index = 0; index < 14; index += 1) {
      const particle = document.createElement('span');
      particle.className = 'menu-particle';
      particle.style.setProperty('--particle-x', `${(index * 7 + 13) % 100}%`);
      particle.style.setProperty('--particle-delay', `${(index % 7) * -1.4}s`);
      particle.style.setProperty('--particle-duration', `${8 + (index % 5) * 1.6}s`);
      particle.style.setProperty('--particle-size', `${4 + (index % 3) * 2}px`);
      pollenEl.appendChild(particle);
    }
  }

  async function refreshNetworkInfo({ silent = false } = {}) {
    if (networkRefreshPending) return networkState;
    networkRefreshPending = true;
    root?.classList.add('network-refreshing');
    if (footerRefreshBtn) footerRefreshBtn.disabled = true;
    if (!silent && footerNetworkSummaryEl) {
      footerNetworkSummaryEl.textContent = 'Listening for the realm bell...';
    }
    try {
      networkState = await networkProbe();
      if (footerNetworkSummaryEl) {
        footerNetworkSummaryEl.textContent = formatMenuNetworkSummary(networkState);
      }
      renderRealmSummary();
      return networkState;
    } finally {
      networkRefreshPending = false;
      root?.classList.remove('network-refreshing');
      if (footerRefreshBtn) footerRefreshBtn.disabled = false;
    }
  }

  function handlePointerMove(/** @type {PointerEvent | MouseEvent | any} */ event) {
    if (!root || root.dataset.parallax !== 'on') return;
    const width = Math.max(window.innerWidth || 1, 1);
    const height = Math.max(window.innerHeight || 1, 1);
    const offsetX = ((Number(event?.clientX ?? width / 2) / width) - 0.5) * 2;
    const offsetY = ((Number(event?.clientY ?? height / 2) / height) - 0.5) * 2;
    root.style.setProperty('--menu-parallax-x', `${(offsetX * 6).toFixed(2)}px`);
    root.style.setProperty('--menu-parallax-y', `${(offsetY * 5).toFixed(2)}px`);
    root.style.setProperty('--menu-foreground-x', `${(offsetX * 10).toFixed(2)}px`);
    root.style.setProperty('--menu-foreground-y', `${(offsetY * 9).toFixed(2)}px`);
  }

  function resetParallax() {
    if (!root) return;
    root.style.setProperty('--menu-parallax-x', '0px');
    root.style.setProperty('--menu-parallax-y', '0px');
    root.style.setProperty('--menu-foreground-x', '0px');
    root.style.setProperty('--menu-foreground-y', '0px');
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab === 'signup' ? 'signup' : 'signin';
      setTab(next);
    });
  });

  realmButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setOverlayState('realms');
    });
  });

  forgotButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (LANDING_CONTENT.forgotPasswordHref && openExternalLink(LANDING_CONTENT.forgotPasswordHref)) {
        return;
      }
      renderStatus('Password recovery will be added with account services.', 'neutral');
    });
  });

  signInRememberEl?.addEventListener('change', () => setRememberAccount(signInRememberEl.checked));
  signUpRememberEl?.addEventListener('change', () => setRememberAccount(signUpRememberEl.checked));

  continueBtn?.addEventListener('click', () => {
    if (primaryCharacter?.id) {
      onSelectCharacter?.(primaryCharacter);
    }
  });

  overlayBackdropEl?.addEventListener('click', () => setOverlayState(null));
  overlayCloseButtons.forEach((button) => {
    button.addEventListener('click', () => setOverlayState(null));
  });

  footerRefreshBtn?.addEventListener('click', () => {
    void refreshNetworkInfo();
  });

  settingsMotionEl?.addEventListener('change', () => {
    sceneSettings.motionEnabled = settingsMotionEl.checked;
    persistSceneSettings();
  });
  settingsParallaxEl?.addEventListener('change', () => {
    sceneSettings.parallaxEnabled = settingsParallaxEl.checked;
    persistSceneSettings();
  });
  settingsFoliageEl?.addEventListener('change', () => {
    sceneSettings.lushFoliage = settingsFoliageEl.checked;
    persistSceneSettings();
  });

  root?.addEventListener?.('pointermove', handlePointerMove);
  root?.addEventListener?.('pointerleave', resetParallax);
  window.addEventListener?.('keydown', (event) => {
    if (event.key === 'Escape' && overlayState) {
      setOverlayState(null);
    }
  });

  signInForm?.addEventListener('submit', (event) => {
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
    onSignIn?.({ username: username.trim(), password, rememberAccount, realmId: selectedRealmId });
  });

  signUpForm?.addEventListener('submit', (event) => {
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
    onSignUp?.({ username: username.trim(), password, rememberAccount, realmId: selectedRealmId });
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

  createForm?.addEventListener('submit', (event) => {
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

  if (footerVersionEl) footerVersionEl.textContent = LANDING_CONTENT.versionLabel;
  renderFooterLinks();
  renderNav();
  renderNewsList();
  renderFeaturedNews();
  renderCommunity();
  renderCredits();
  renderRealmChoices();
  hydrateClassOptions();
  updateClassPreview(classSelectEl?.value);
  populatePollen();
  applySceneSettings();
  setRememberAccount(true);
  setTab(tab);
  setStep(step);
  setProgressStep(progressStep);
  setSelectedRealmId(selectedRealmId, { announce: false });
  renderStatus('The shrine lanterns are lit. Sign in to continue your journey.', 'neutral');
  void refreshNetworkInfo({ silent: true });

  return {
    setOpen,
    setStep,
    setTab,
    setLoading,
    setAccount,
    setProgressStep,
    setStatusMessage: renderStatus,
    setPrimaryCharacter,
    setSelectedCharacterId,
    setCharacters,
    setError,
    clearErrors,
    setRememberAccount,
    getRememberAccount,
    setSelectedRealmId,
    setLastPlayedCharacterId,
    openOverlay: setOverlayState,
    refreshNetworkInfo,
    focusFeaturedNews,
    getState: () => ({
      open,
      step,
      tab,
      progressStep,
      statusTone,
      selectedCharacterId,
      lastPlayedCharacterId,
      primaryCharacterId: primaryCharacter?.id ?? null,
      rememberAccount,
      selectedRealmId,
      overlayState,
      networkState,
      characters: characters.map((character) => ({
        id: character.id,
        name: character.name,
        classId: character.classId,
        level: character.level,
      })),
    }),
  };
}
