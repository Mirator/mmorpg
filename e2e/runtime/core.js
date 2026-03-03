// @ts-check
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  DATABASE_URL_E2E,
  PORT,
  resetE2eDatabase,
  sleep,
  waitForServer,
} from '../helpers.js';
import { createRunId, createUniqueToken, moveToPoint, safeClick, signUpAndCreateCharacter } from './actions.js';
import { createBrowser, createPageFactory } from './browser.js';
import { writeFailureArtifacts } from './artifacts.js';

const TEST_ADMIN_PASSWORD = '1234';

/**
 * @param {{ name?: string; run: (ctx: any) => Promise<unknown> }} scenario
 * @param {{ adminPassword?: string }} [options]
 */
export async function runScenario(scenario, options = {}) {
  const trackers = /** @type {{ contexts: any[]; pages: any[] }} */ ({ contexts: [], pages: [] });
  const runId = createRunId(scenario?.name ?? 'scenario');
  let stage = 'boot';
  let browser = /** @type {any} */ (null);

  resetE2eDatabase();
  const server = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      ADMIN_PASSWORD: options.adminPassword ?? TEST_ADMIN_PASSWORD,
      E2E_TEST: 'true',
      DATABASE_URL: DATABASE_URL_E2E,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    stage = 'wait-server';
    await waitForServer(server);

    stage = 'launch-browser';
    browser = await createBrowser();
    const createPage = createPageFactory(browser, trackers);

    await scenario.run({
      browser,
      createPage,
      /**
       * @param {string} nextStage
       */
      setStage(nextStage) {
        stage = nextStage;
      },
      recordNote() {},
      runId,
      helpers: {
        safeClick,
        signUpAndCreateCharacter,
        moveToPoint,
        createUniqueToken: (
          /** @type {any} */ prefix,
          /** @type {any} */ suffix
        ) => createUniqueToken(prefix, runId, suffix),
      },
    });
  } catch (error) {
    await writeFailureArtifacts({
      scenarioName: scenario?.name ?? 'scenario',
      stage,
      error,
      pages: trackers.pages,
      runId,
    });
    throw error;
  } finally {
    for (const context of trackers.contexts) {
      await context.close().catch(() => {});
    }
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit').catch(() => {}),
      sleep(1000),
    ]);
    if (server.exitCode == null) {
      server.kill('SIGKILL');
    }
  }
}
