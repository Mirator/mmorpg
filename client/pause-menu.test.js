import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_ICON_CREDITS } from './gameIcons.js';
import { createPauseMenu } from './pause-menu.js';
import { createFakeDocument } from './test/fakeDom.js';

describe('pause menu credits view', () => {
  const originalDocument = global.document;
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;
  let elements;

  beforeEach(() => {
    const ids = [
      'pause-menu',
      'pause-menu-main',
      'pause-menu-controls',
      'pause-menu-options',
      'pause-menu-credits',
      'controls-list',
      'keybinds-list',
      'pause-credits-summary',
      'pause-credits-source',
      'pause-credits-license',
      'pause-credits-icons',
      'pause-resume-btn',
      'pause-options-btn',
      'pause-controls-btn',
      'pause-credits-btn',
      'pause-character-btn',
      'pause-signout-btn',
      'pause-controls-back-btn',
      'pause-options-back-btn',
      'pause-credits-back-btn',
      'pause-fps-toggle',
      'keybinds-reset-btn',
    ];
    const fake = createFakeDocument(ids);
    elements = fake.elements;
    elements['pause-menu-controls'].className = 'hidden';
    elements['pause-menu-options'].className = 'hidden';
    elements['pause-menu-credits'].className = 'hidden';
    global.document = fake.document;
    global.window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    global.localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  });

  afterEach(() => {
    global.document = originalDocument;
    global.window = originalWindow;
    global.localStorage = originalLocalStorage;
  });

  it('renders icon attribution and returns from credits to the main view on escape', () => {
    const pauseMenu = createPauseMenu({
      onResume: () => {},
      onReturnToCharacterScreen: () => {},
      onSignOut: () => {},
      isGuest: false,
      setPauseMenuOpen: () => {},
      getShowFps: () => false,
      setShowFps: () => {},
    });

    pauseMenu.showCredits();

    expect(elements['pause-menu-main'].classList.contains('hidden')).toBe(true);
    expect(elements['pause-menu-credits'].classList.contains('hidden')).toBe(false);
    expect(elements['pause-credits-summary'].textContent).toContain('Icons made by Lorc');
    expect(elements['pause-credits-source'].children[0].textContent).toBe(GAME_ICON_CREDITS.sourceName);
    expect(elements['pause-credits-license'].children[0].textContent).toBe(GAME_ICON_CREDITS.licenseName);
    expect(elements['pause-credits-icons'].children).toHaveLength(GAME_ICON_CREDITS.usedFiles.length);

    pauseMenu.handleEscape();

    expect(elements['pause-menu-main'].classList.contains('hidden')).toBe(false);
    expect(elements['pause-menu-credits'].classList.contains('hidden')).toBe(true);
  });
});
