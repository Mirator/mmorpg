// @ts-check
import { chromium } from 'playwright';
import { TEST_TIMEOUT_MS } from '../helpers.js';

export const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
export const SMALL_VIEWPORT = { width: 560, height: 840 };

const PAGE_RUNTIME_KEY = Symbol.for('mmorpg.e2e.pageRuntime');
const IGNORED_ERROR_SNIPPETS = [
  'WebGLRenderer: A WebGL context could not be created',
  'WebGLRenderer: Error creating WebGL context',
  'WebGL unavailable, falling back to canvas renderer.',
  'WebGL unavailable.',
];

/**
 * @param {string} text
 */
function shouldIgnoreError(text) {
  return IGNORED_ERROR_SNIPPETS.some((snippet) => text.includes(snippet));
}

/**
 * @param {any} page
 */
export function getPageRuntime(page) {
  return /** @type {any} */ (page)?.[PAGE_RUNTIME_KEY] ?? null;
}

export async function createBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
}

/**
 * @param {any} browser
 * @param {{ contexts: any[]; pages: any[] }} trackers
 */
export function createPageFactory(browser, trackers) {
  return async function createPage(
    /**
     * @type {{ viewport?: { width: number; height: number } }}
     */
    options = {}
  ) {
    const context = await browser.newContext({
      viewport: options.viewport ?? DESKTOP_VIEWPORT,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(TEST_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(TEST_TIMEOUT_MS);
    await page.addInitScript(() => {
      if (!localStorage.getItem('e2e_clear_done')) {
        localStorage.clear();
        localStorage.setItem('e2e_clear_done', 'true');
      }
    });

    const runtime = /** @type {{ consoleErrors: string[]; pageErrors: string[]; requestFailures: string[] }} */ ({
      consoleErrors: [],
      pageErrors: [],
      requestFailures: [],
    });
    /** @type {any} */ (page)[PAGE_RUNTIME_KEY] = runtime;
    page.on('pageerror', (/** @type {any} */ err) => {
      const text = String(err);
      if (!shouldIgnoreError(text)) {
        runtime.pageErrors.push(text);
      }
    });
    page.on('console', (/** @type {any} */ msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!shouldIgnoreError(text)) {
        runtime.consoleErrors.push(text);
      }
    });
    page.on('requestfailed', (/** @type {any} */ request) => {
      const failure = request.failure()?.errorText ?? 'unknown request failure';
      runtime.requestFailures.push(`${request.method()} ${request.url()} :: ${failure}`);
    });

    trackers.contexts.push(context);
    trackers.pages.push(page);

    return { context, page };
  };
}
