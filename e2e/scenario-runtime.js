// @ts-check

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE_URL,
  DATABASE_URL_E2E,
  PORT,
  TEST_TIMEOUT_MS,
  resetE2eDatabase,
  sleep,
  waitForCondition,
  waitForLoadingScreenToDisappear,
  waitForMenuStepOrError,
  waitForServer,
} from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ARTIFACT_DIR = path.resolve(__dirname, '../output/e2e');
const TEST_ADMIN_PASSWORD = '1234';

export const /** @type {{ width: number, height: number }} */ DESKTOP_VIEWPORT = {
  width: 1280,
  height: 720,
};

function sanitizeToken(/** @type {unknown} */ value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'run';
}

export function createUniqueToken(/** @type {string} */ prefix) {
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const safePrefix = sanitizeToken(prefix).replace(/-/g, '_');
  return `${safePrefix.slice(0, 8)}_${stamp.slice(-4)}${random.slice(0, 4)}`;
}

export async function safeClick(
  /** @type {import('playwright').Page} */ page,
  /** @type {string} */ selector,
  /** @type {number} */ timeout = TEST_TIMEOUT_MS
) {
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

function getRenderStateText(/** @type {import('playwright').Page} */ page) {
  return page
    .evaluate(() => {
      if (typeof window.render_game_to_text === 'function') {
        return window.render_game_to_text();
      }
      return null;
    })
    .catch(() => null);
}

async function writeFailureArtifacts(
  /** @type {{
   *   name: string,
   *   stage: string,
   *   error: unknown,
   *   pages: import('playwright').Page[],
   * }} */ options
) {
  const { name, stage, error, pages } = options;
  fs.mkdirSync(E2E_ARTIFACT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${stamp}-${sanitizeToken(name)}-${sanitizeToken(stage)}`;
  const errorPath = path.join(E2E_ARTIFACT_DIR, `${prefix}.error.txt`);

  fs.writeFileSync(
    errorPath,
    [
      `scenario: ${name}`,
      `stage: ${stage}`,
      `message: ${error instanceof Error ? error.message : String(error)}`,
      '',
      error instanceof Error ? (error.stack ?? '') : '',
    ].join('\n'),
    'utf8'
  );

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page || page.isClosed()) continue;
    const suffix = pages.length > 1 ? `-p${index + 1}` : '';
    const screenshotPath = path.join(E2E_ARTIFACT_DIR, `${prefix}${suffix}.screenshot.png`);
    const statePath = path.join(E2E_ARTIFACT_DIR, `${prefix}${suffix}.render-state.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const stateText = await getRenderStateText(page);
    fs.writeFileSync(statePath, stateText ?? 'null', 'utf8');
  }
}

/**
 * @param {import('playwright').Browser} browser
 * @param {{ viewport?: { width: number, height: number } }} [options]
 */
async function createPage(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? DESKTOP_VIEWPORT,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TEST_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(TEST_TIMEOUT_MS);
  await page.addInitScript(() => {
    localStorage.clear();
  });
  return { context, page };
}

export async function signUpAndCreateCharacter(
  /** @type {import('playwright').Page} */ page,
  /** @type {{
   *   username: string,
   *   password: string,
   *   characterName: string,
   *   classId?: string,
   * }} */ options
) {
  const { username, password, characterName, classId = 'fighter' } = options;

  let /** @type {unknown} */ navigationError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TEST_TIMEOUT_MS + 10000 });
      navigationError = null;
      break;
    } catch (error) {
      navigationError = error;
      if (attempt === 2) {
        throw error;
      }
      await sleep(500);
    }
  }
  if (navigationError) {
    throw navigationError instanceof Error ? navigationError : new Error('Failed to load game page');
  }
  await page.waitForFunction(() => window.__game && typeof window.__game.getState === 'function');
  await page.waitForSelector('#menu.open');
  await safeClick(page, '.menu-tab[data-tab="signup"]');
  await page.waitForFunction(() => !document.querySelector('#signup-form')?.classList.contains('hidden'));

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

export function getInventoryItems(/** @type {any} */ state) {
  return Array.isArray(state?.inventory?.items) ? state.inventory.items : [];
}

export function countInventoryKind(/** @type {any} */ state, /** @type {string} */ kind) {
  return getInventoryItems(state).reduce((/** @type {number} */ total, /** @type {any} */ item) => {
    if (!item || item.kind !== kind) return total;
    return total + Math.max(0, Math.floor(Number(item.count) || 0));
  }, 0);
}

export function getOtherVisiblePlayer(/** @type {any} */ state, /** @type {string | null} */ excludeId = null) {
  const players = Array.isArray(state?.players) ? state.players : [];
  return (
    players.find(
      (/** @type {any} */ player) =>
        player?.id &&
        player.id !== excludeId &&
        !player.dead
    ) ?? null
  );
}

export async function moveToPoint(
  /** @type {import('playwright').Page} */ page,
  /** @type {{ x: number, z: number }} */ point,
  /** @type {(state: any) => boolean} */ condition,
  /** @type {string} */ label
) {
  const start = Date.now();
  let /** @type {unknown} */ lastError = null;
  while (Date.now() - start < TEST_TIMEOUT_MS) {
    await page.evaluate(
      (/** @type {{ x: number, z: number }} */ nextPoint) => window.__game?.moveTo(nextPoint.x, nextPoint.z),
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

/**
 * @param {{
 *   name: string,
 *   run: (ctx: {
 *     browser: import('playwright').Browser,
 *     createPage: (options?: { viewport?: { width: number, height: number } }) => Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page }>,
 *     setStage: (stage: string) => void,
 *   }) => Promise<void>,
 * }} options
 */
export async function runScenario(options) {
  const { name, run } = options;
  resetE2eDatabase();
  const server = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
      E2E_TEST: 'true',
      DATABASE_URL: DATABASE_URL_E2E,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let /** @type {import('playwright').Browser | null} */ browser = null;
  const /** @type {import('playwright').BrowserContext[]} */ contexts = [];
  const /** @type {import('playwright').Page[]} */ pages = [];
  let stage = 'boot';

  try {
    stage = 'wait-server';
    await waitForServer(server);

    stage = 'launch-browser';
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });
    const activeBrowser = browser;

    await run({
      browser: activeBrowser,
      createPage: async (pageOptions = {}) => {
        const created = await createPage(activeBrowser, pageOptions);
        contexts.push(created.context);
        pages.push(created.page);
        return created;
      },
      setStage: (/** @type {string} */ nextStage) => {
        stage = nextStage;
      },
    });
  } catch (error) {
    await writeFailureArtifacts({ name, stage, error, pages });
    throw error;
  } finally {
    for (const context of contexts) {
      await context.close().catch(() => {});
    }
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
  }
}
