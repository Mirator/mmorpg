// @ts-check
import {
  getBaseURL,
  TEST_TIMEOUT_MS,
  sleep,
  waitForCondition,
  waitForLoadingScreenToDisappear,
  waitForMenuStepOrError,
} from '../helpers.js';

/**
 * @param {any} value
 */
function sanitizeToken(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'run';
}

/**
 * @param {any} prefix
 */
export function createRunId(prefix) {
  const safePrefix = sanitizeToken(prefix).replace(/-/g, '_');
  return `${safePrefix}_${Date.now().toString(36)}`;
}

/**
 * @param {any} prefix
 * @param {any} [runId]
 * @param {any} [suffix]
 */
export function createUniqueToken(prefix, runId, suffix) {
  const safePrefix = sanitizeToken(prefix).replace(/-/g, '_');
  if (runId == null && suffix == null) {
    const stamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `${safePrefix.slice(0, 8)}_${stamp.slice(-4)}${random.slice(0, 4)}`;
  }
  return `${safePrefix}_${String(runId ?? '').slice(-6)}_${suffix}`;
}

/**
 * @param {any} page
 * @param {string} selector
 * @param {number} [timeout]
 */
export async function safeClick(page, selector, timeout = TEST_TIMEOUT_MS) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  try {
    await page.click(selector, { timeout });
  } catch {
    await page.evaluate((/** @type {string} */ sel) => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) {
        throw new Error(`safeClick target missing: ${sel}`);
      }
      el.click();
    }, selector);
  }
}

/**
 * @param {any} page
 * @param {{
 *   username: string;
 *   password: string;
 *   characterName: string;
 *   classId?: string;
 * }} options
 */
export async function signUpAndCreateCharacter(page, options) {
  const { username, password, characterName, classId = 'fighter' } = options;

  const baseURL = getBaseURL();
  let navigationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(baseURL, { waitUntil: 'load', timeout: TEST_TIMEOUT_MS + 10000 });
      navigationError = null;
      break;
    } catch (error) {
      navigationError = error;
      if (attempt === 2) {
        throw error;
      }
      await sleep(1000);
    }
  }
  if (navigationError) {
    throw navigationError instanceof Error ? navigationError : new Error('Failed to load game page');
  }
  await page.waitForFunction(() => window.__game && typeof window.__game.getState === 'function', { timeout: 20000 });
  await page.waitForSelector('#menu.open', { state: 'visible', timeout: 20000 });
  await sleep(500);
  const signupTab = page.locator('.menu-tab[data-tab="signup"]');
  const tabVisible = await signupTab.isVisible().catch(() => false);
  if (tabVisible) {
    await sleep(300);
    await safeClick(page, '.menu-tab[data-tab="signup"]', 20000);
  } else {
    await page.evaluate(() => {
      const root = document.getElementById('menu');
      const signupForm = document.getElementById('signup-form');
      const signinForm = document.getElementById('signin-form');
      if (root && signupForm && signinForm) {
        root.dataset.tab = 'signup';
        signupForm.classList.remove('hidden');
        signinForm.classList.add('hidden');
      }
    });
  }
  await page.waitForSelector('#signup-form:not(.hidden)', { state: 'visible', timeout: 10000 });

  await page.fill('#signup-username', username);
  await page.fill('#signup-password', password);
  await page.keyboard.press('Enter');

  const signUpResult = await waitForMenuStepOrError(page, 'characters', TEST_TIMEOUT_MS);
  if (!signUpResult.ok) {
    throw new Error(`Sign-up failed: ${signUpResult.errorText ?? 'unknown error'}`);
  }

  await safeClick(page, '#character-create-open');
  await page.waitForSelector('#menu[data-step="create"]');
  await page.fill('#character-name', characterName);
  await page.selectOption('#character-class', classId);
  await safeClick(page, '#character-create-form button[type="submit"]');

  await waitForLoadingScreenToDisappear(page).catch(() => {});
  await page
    .waitForFunction(() => !document.querySelector('#menu')?.classList.contains('open'))
    .catch(() => {});
  return waitForCondition(
    page,
    (/** @type {any} */ state) => !!state.player && state.mode === 'play',
    TEST_TIMEOUT_MS + 10000,
    'enter world'
  );
}

/**
 * @param {any} page
 * @param {{ x: number; z: number }} point
 * @param {(state: any) => boolean} condition
 * @param {string} label
 */
export async function moveToPoint(page, point, condition, label) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < TEST_TIMEOUT_MS) {
    await page.evaluate(
      (/** @type {{ x: number; z: number }} */ nextPoint) => window.__game?.moveTo(nextPoint.x, nextPoint.z),
      point
    );
    const remainingMs = TEST_TIMEOUT_MS - (Date.now() - start);
    const attemptTimeoutMs = Math.max(250, Math.min(2500, remainingMs));
    try {
      return await waitForCondition(page, condition, attemptTimeoutMs, label);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${label}`);
}
