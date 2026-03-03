// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPageRuntime } from './browser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ARTIFACT_DIR = path.resolve(__dirname, '../../output/e2e');

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
 * @param {any} page
 */
async function getRenderStateText(page) {
  return page
    .evaluate(() => {
      if (typeof window.render_game_to_text === 'function') {
        return window.render_game_to_text();
      }
      return null;
    })
    .catch(() => null);
}

/**
 * @param {{
 *   scenarioName: string;
 *   stage: string;
 *   error: unknown;
 *   pages: any[];
 *   runId: string;
 * }} params
 */
export async function writeFailureArtifacts({ scenarioName, stage, error, pages, runId }) {
  fs.mkdirSync(E2E_ARTIFACT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${stamp}-${sanitizeToken(scenarioName)}-${sanitizeToken(stage)}-${sanitizeToken(runId)}`;
  const errorPath = path.join(E2E_ARTIFACT_DIR, `${prefix}.error.txt`);
  const consolePath = path.join(E2E_ARTIFACT_DIR, `${prefix}.console.log`);

  fs.writeFileSync(
    errorPath,
    [
      `scenario: ${scenarioName}`,
      `stage: ${stage}`,
      `runId: ${runId}`,
      `message: ${error instanceof Error ? error.message : String(error)}`,
      '',
      error instanceof Error ? (error.stack ?? '') : '',
    ].join('\n'),
    'utf8'
  );

  const logChunks = /** @type {string[]} */ ([]);
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page || page.isClosed()) continue;
    const suffix = pages.length > 1 ? `-p${index + 1}` : '';
    const screenshotPath = path.join(E2E_ARTIFACT_DIR, `${prefix}${suffix}.screenshot.png`);
    const statePath = path.join(E2E_ARTIFACT_DIR, `${prefix}${suffix}.render-state.json`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    const stateText = await getRenderStateText(page);
    fs.writeFileSync(statePath, stateText ?? 'null', 'utf8');

    const runtime = getPageRuntime(page);
    if (runtime) {
      logChunks.push(
        [`[page ${index + 1}] consoleErrors`, ...runtime.consoleErrors, '', `[page ${index + 1}] pageErrors`, ...runtime.pageErrors, '', `[page ${index + 1}] requestFailures`, ...runtime.requestFailures].join('\n')
      );
    }
  }

  fs.writeFileSync(consolePath, logChunks.join('\n\n').trim() || '[no buffered logs]', 'utf8');
}
