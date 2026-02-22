// @ts-check
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 3001;
export const BASE_URL = `http://localhost:${PORT}`;
export const SERVER_START_TIMEOUT_MS = 8000;
export const TEST_TIMEOUT_MS = 20000;
export const DEATH_TIMEOUT_MS = 30000;
export const LOADING_TIMEOUT_MS = 30000;
export const DATABASE_URL_E2E = process.env.DATABASE_URL_E2E;

export function resetE2eDatabase() {
  if (!DATABASE_URL_E2E) {
    throw new Error('DATABASE_URL_E2E is not set; cannot run e2e DB reset.');
  }
  const result = spawnSync('npm', ['run', 'db:reset:e2e'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('Failed to reset e2e database.');
  }
}

export function sleep(/** @type {any} */ ms) {
  return new Promise((/** @type {any} */ resolve) => setTimeout(resolve, ms));
}

export async function getMenuStatus(/** @type {any} */ page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#menu');
    const authError = document.querySelector('#menu-auth-error')?.textContent?.trim() ?? '';
    const charactersError =
      document.querySelector('#menu-characters-error')?.textContent?.trim() ?? '';
    const createError = document.querySelector('#menu-create-error')?.textContent?.trim() ?? '';
    const step = menu?.getAttribute('data-step') ?? null;
    return {
      step,
      open: menu?.classList?.contains('open') ?? false,
      loading: menu?.classList?.contains('loading') ?? false,
      authError,
      charactersError,
      createError,
    };
  });
}

export async function getLoadingScreenState(/** @type {any} */ page) {
  return page.evaluate(() => {
    const el = document.querySelector('#loading-screen');
    const bar = document.querySelector('.loading-progress-bar');
    if (!el) {
      return { visible: false, text: null, stage: null, progress: null, indeterminate: false };
    }
    return {
      visible: el.classList.contains('visible'),
      stage: document.querySelector('#loading-stage')?.textContent?.trim() ?? null,
      text: document.querySelector('#loading-text')?.textContent?.trim() ?? null,
      progress: bar?.getAttribute('aria-valuenow') ?? null,
      indeterminate: bar?.classList.contains('indeterminate') ?? false,
    };
  });
}

export async function waitForLoadingScreenToDisappear(/** @type {any} */ page, /** @type {any} */ timeoutMs = LOADING_TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getLoadingScreenState(page);
    if (!state.visible) return;
    await sleep(100);
  }
  throw new Error('Loading screen did not disappear within timeout');
}

export async function waitForMenuStepOrError(/** @type {any} */ page, /** @type {any} */ step, /** @type {any} */ timeoutMs) {
  const start = Date.now();
  let /** @type {any} */ lastState = null;
  while (Date.now() - start < timeoutMs) {
    const state = await getMenuStatus(page);
    lastState = state;
    if (state.step === step) {
      return { ok: true, state };
    }
    const errorText = state.authError || state.charactersError || state.createError;
    if (errorText) {
      return { ok: false, errorText, state };
    }
    await sleep(100);
  }
  return {
    ok: false,
    errorText: `Timed out waiting for menu step "${step}"`,
    state: lastState,
  };
}

export function withTimeout(/** @type {any} */ promise, /** @type {any} */ ms, /** @type {any} */ label) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeoutId;
  const timeout = new Promise((/** @type {any} */ _, /** @type {any} */ reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeout,
  ]);
}

export async function waitForServer(/** @type {any} */ proc) {
  return withTimeout(
    new Promise((/** @type {any} */ resolve, /** @type {any} */ reject) => {
      const onData = (/** @type {any} */ data) => {
        const text = data.toString();
        if (text.includes('Server running')) {
          cleanup();
          resolve(undefined);
        }
      };
      const onError = (/** @type {any} */ err) => {
        cleanup();
        reject(err);
      };
      const onExit = (/** @type {any} */ code) => {
        cleanup();
        reject(new Error(`Server exited early with code ${code}`));
      };
      const cleanup = () => {
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onData);
        proc.off('error', onError);
        proc.off('exit', onExit);
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      proc.on('error', onError);
      proc.on('exit', onExit);
    }),
    SERVER_START_TIMEOUT_MS,
    'Server start'
  );
}

export async function getState(/** @type {any} */ page) {
  const text = await page.evaluate(() => {
    if (typeof window.render_game_to_text === 'function') {
      return window.render_game_to_text();
    }
    return null;
  });
  if (!text) throw new Error('render_game_to_text unavailable');
  return JSON.parse(text);
}

export async function advance(/** @type {any} */ page, /** @type {any} */ ms) {
  await page.evaluate((/** @type {any} */ delta) => {
    if (typeof window.advanceTime === 'function') {
      return window.advanceTime(delta);
    }
    return null;
  }, ms);
}

export function distance(/** @type {any} */ a, /** @type {any} */ b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function segmentDistanceToPoint(/** @type {any} */ a, /** @type {any} */ b, /** @type {any} */ p) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apz = p.z - a.z;
  const abLen2 = abx * abx + abz * abz;
  if (abLen2 === 0) return Math.hypot(apx, apz);
  let t = (apx * abx + apz * abz) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const /** @type {any} */ closest = { x: a.x + abx * t, z: a.z + abz * t };
  return distance(closest, p);
}

export function hasLineOfSight(/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ obstacles, /** @type {any} */ buffer = 0.8) {
  if (!Array.isArray(obstacles)) return true;
  for (const obs of obstacles) {
    const dist = segmentDistanceToPoint(from, to, obs);
    if (dist < obs.r + buffer) return false;
  }
  return true;
}

export async function waitForCondition(/** @type {any} */ page, /** @type {any} */ condition, /** @type {any} */ timeoutMs, /** @type {any} */ label) {
  const start = Date.now();
  let /** @type {any} */ lastState = null;
  while (Date.now() - start < timeoutMs) {
    const state = await getState(page);
    lastState = state;
    if (condition(state)) return state;
    await advance(page, 1000 / 30);
    await sleep(50);
  }
  const lastPlayer = lastState?.player
    ? {
        x: Number(lastState.player.x?.toFixed?.(2) ?? lastState.player.x),
        z: Number(lastState.player.z?.toFixed?.(2) ?? lastState.player.z),
        hp: lastState.player.hp,
        inv: lastState.player.inv,
        currencyCopper: lastState.player.currencyCopper,
        dead: lastState.player.dead,
      }
    : null;
  throw new Error(
    `Timed out waiting for ${label}. Last player state: ${JSON.stringify(lastPlayer)}`
  );
}
