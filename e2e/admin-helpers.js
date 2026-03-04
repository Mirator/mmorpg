// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './helpers.js';

/**
 * @param {unknown} condition
 * @param {string} message
 */
export function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeToken(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'run';
}

/**
 * @param {import('playwright').Page} page
 * @param {string} templateId
 * @param {{ x: number, y: number }} targetPosition
 */
export async function dispatchTemplateDrop(page, templateId, targetPosition) {
  await page.evaluate(
    ({ templateId: id, target }) => {
      const canvas = document.querySelector('#map-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error('Map canvas not found');
      }
      const rect = canvas.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', id);
      const clientX = rect.left + target.x;
      const clientY = rect.top + target.y;
      canvas.dispatchEvent(
        new DragEvent('dragover', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX,
          clientY,
        })
      );
      canvas.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer,
          clientX,
          clientY,
        })
      );
    },
    { templateId, target: targetPosition }
  );
}

/**
 * @param {import('playwright').Page} page
 */
export async function unlockPage(page) {
  await page.fill('#admin-pass', '1234');
  await page.click('#auth-form button[type="submit"]');
  await page.waitForSelector('#status.ok', { timeout: 15_000 });
}

/**
 * @param {import('playwright').Page} page
 */
export async function waitForRestoredSession(page) {
  await page.waitForSelector('#status.ok', { timeout: 15_000 });
  const passwordValue = await page.locator('#admin-pass').inputValue();
  ensure(passwordValue === '', 'Admin password field should stay empty after session restore.');
}

/**
 * @param {import('playwright').Page} page
 * @param {string} alias
 */
export async function setAlias(page, alias) {
  await page.evaluate((nextAlias) => {
    localStorage.setItem('ra.admin.alias', nextAlias);
  }, alias);
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<Record<string, number>>}
 */
export async function readZoneCounts(page) {
  return page.evaluate(() => {
    const state = window.__MAP_EDITOR_V2__?.getState?.();
    const zone = state?.zoneState ?? {};
    return {
      navAreas: Array.isArray(zone.navAreas) ? zone.navAreas.length : 0,
      triggers: Array.isArray(zone.triggers) ? zone.triggers.length : 0,
      paths: Array.isArray(zone.paths) ? zone.paths.length : 0,
      lightingRegions: Array.isArray(zone.lightingRegions) ? zone.lightingRegions.length : 0,
    };
  });
}

/**
 * @param {import('playwright').Page} page
 * @param {string} key
 * @param {number} min
 * @param {number} [timeoutMs]
 * @returns {Promise<Record<string, number>>}
 */
export async function waitForZoneCountAtLeast(page, key, min, timeoutMs = 2500) {
  const start = Date.now();
  /** @type {Record<string, number> | null} */
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await readZoneCounts(page);
    if ((last[key] ?? 0) >= min) {
      return last;
    }
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${key} >= ${min}. Last counts: ${JSON.stringify(last)}`);
}

/**
 * @param {import('playwright').Page} page
 * @param {{
 *   mode: string,
 *   key: string,
 *   clicks: Array<{ x: number, y: number }>,
 *   label: string,
 *   attempts?: number,
 * }} config
 * @returns {Promise<Record<string, number>>}
 */
export async function paintModeWithRetry(page, config) {
  const { mode, key, clicks, label, attempts = 3 } = config;
  const before = await readZoneCounts(page);
  const targetCount = (before[key] ?? 0) + 1;
  /** @type {Error | null} */
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await page.click(`button[data-mode="${mode}"]`);
    await page.click('button[data-tool="paint"]');
    for (const point of clicks) {
      await page.mouse.click(point.x, point.y);
    }

    try {
      return await waitForZoneCountAtLeast(page, key, targetCount, 3000);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `${label} did not change ${key} count after ${attempts} attempts. ` +
      `Last error: ${lastError?.message ?? 'unknown error'}`
  );
}

/**
 * @param {import('playwright').Page | null} page
 * @returns {Promise<{ url: string | null, status: string | null, saveStatus: string | null } | null>}
 */
async function readArtifactMeta(page) {
  if (!page || page.isClosed()) return null;
  return page
    .evaluate(() => {
      return {
        url: window.location.href,
        status: document.querySelector('#status')?.textContent?.trim() ?? null,
        saveStatus: document.querySelector('#save-status')?.textContent?.trim() ?? null,
      };
    })
    .catch(() => null);
}

/**
 * @param {{
 *   artifactDir: string,
 *   page: import('playwright').Page | null,
 *   stage: string,
 *   error: unknown,
 * }} params
 */
export async function writeFailureArtifacts({ artifactDir, page, stage, error }) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${stamp}-${sanitizeToken(stage)}`;
  const errorPath = path.join(artifactDir, `${prefix}.error.txt`);
  const errorValue = error instanceof Error ? error : new Error(String(error));

  fs.writeFileSync(
    errorPath,
    [
      `stage: ${stage}`,
      `message: ${errorValue.message}`,
      '',
      errorValue.stack ?? '',
    ].join('\n'),
    'utf8'
  );

  if (!page || page.isClosed()) return;

  const screenshotPath = path.join(artifactDir, `${prefix}.screenshot.png`);
  const metaPath = path.join(artifactDir, `${prefix}.meta.json`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const meta = await readArtifactMeta(page);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}
