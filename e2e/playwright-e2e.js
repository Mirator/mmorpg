// @ts-check
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSellPriceCopper } from '../shared/economy.js';
import {
  BASE_URL,
  DATABASE_URL_E2E,
  DEATH_TIMEOUT_MS,
  PORT,
  TEST_TIMEOUT_MS,
  advance,
  distance,
  getLoadingScreenState,
  getState,
  hasLineOfSight,
  resetE2eDatabase,
  sleep,
  waitForCondition,
  waitForLoadingScreenToDisappear,
  waitForMenuStepOrError,
  waitForServer,
} from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ARTIFACT_DIR = path.resolve(__dirname, '../output/e2e');
const /** @type {any} */ DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const /** @type {any} */ SMALL_VIEWPORT = { width: 560, height: 840 };
const TEST_ADMIN_PASSWORD = '1234';
const E2E_ATTEMPTS = Math.max(1, Number.parseInt(process.env.E2E_ATTEMPTS ?? '', 10) || 1);

function sanitizeToken(/** @type {any} */ value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'run';
}

async function readVendorMetrics(/** @type {any} */ page) {
  return page.evaluate(() => {
    function readBounds(/** @type {any} */ selector) {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        selector,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }

    const tabs = Array.from(document.querySelectorAll('.vendor-tab')).map((/** @type {any} */ tab) => {
      const rect = tab.getBoundingClientRect();
      return {
        tab: tab.getAttribute('data-tab'),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      tradeOpen: document.body.classList.contains('trade-open'),
      panel: readBounds('#vendor-panel'),
      closeButton: readBounds('#vendor-panel-close'),
      tabs,
    };
  });
}

async function readHudProgressMetrics(/** @type {any} */ page) {
  return page.evaluate(() => {
    function readBounds(/** @type {any} */ selector) {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible =
        !el.classList.contains('hidden') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0 &&
        rect.width > 1 &&
        rect.height > 1;
      return {
        selector,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        visible,
      };
    }

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      castBarActive: document.body.classList.contains('cast-bar-active'),
      castBar: readBounds('#cast-bar-wrap'),
      abilityBar: readBounds('#ability-bar'),
      prompt: readBounds('#prompt'),
    };
  });
}

function rectanglesOverlap(/** @type {any} */ a, /** @type {any} */ b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function assertHarvestProgressHudPlacement(/** @type {any} */ page, /** @type {any} */ label) {
  const metrics = await readHudProgressMetrics(page);
  const castBar = metrics.castBar;
  const abilityBar = metrics.abilityBar;
  const prompt = metrics.prompt;
  if (!metrics.castBarActive) {
    throw new Error(`${label}: body is missing cast-bar-active class while harvest is active`);
  }
  if (!castBar?.visible) {
    throw new Error(`${label}: cast bar is not visible while harvest is active`);
  }
  if (!abilityBar?.visible) {
    throw new Error(`${label}: ability bar is not visible during HUD layout assertion`);
  }

  const viewportCenterX = metrics.viewport.width / 2;
  const castCenterX = castBar.left + castBar.width / 2;
  const centerOffset = Math.abs(castCenterX - viewportCenterX);
  if (centerOffset > 24) {
    throw new Error(`${label}: cast bar center offset is ${centerOffset.toFixed(1)}px (expected <= 24px)`);
  }

  const gapAboveAbility = abilityBar.top - castBar.bottom;
  if (gapAboveAbility < 4 || gapAboveAbility > 24) {
    throw new Error(
      `${label}: cast bar gap above ability bar is ${gapAboveAbility.toFixed(1)}px (expected 4px to 24px)`
    );
  }

  if (prompt?.visible && rectanglesOverlap(castBar, prompt)) {
    throw new Error(`${label}: prompt overlaps cast bar while harvest is active`);
  }
}

function isClickableInViewport(/** @type {any} */ rect, /** @type {any} */ viewport) {
  if (!rect || !viewport) return false;
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.left < 0 || rect.top < 0) return false;
  if (rect.right > viewport.width || rect.bottom > viewport.height) return false;
  return true;
}

function isWithinViewport(
  /** @type {any} */ rect,
  /** @type {any} */ viewport,
  /** @type {any} */ tolerance = 0
) {
  if (!rect || !viewport) return false;
  return (
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance
  );
}

async function assertVendorControlsInViewport(/** @type {any} */ page, /** @type {any} */ label) {
  const metrics = await readVendorMetrics(page);
  const buyTab = metrics.tabs.find((/** @type {any} */ tab) => tab.tab === 'buy') ?? null;
  const sellTab = metrics.tabs.find((/** @type {any} */ tab) => tab.tab === 'sell') ?? null;

  for (const [name, rect] of [
    ['vendor panel', metrics.panel],
    ['vendor close button', metrics.closeButton],
    ['vendor buy tab', buyTab],
    ['vendor sell tab', sellTab],
  ]) {
    if (!isClickableInViewport(rect, metrics.viewport)) {
      throw new Error(`${label}: ${name} is not fully inside viewport`);
    }
  }
}

async function assertVendorTradePanelsSeparated(/** @type {any} */ page, /** @type {any} */ label) {
  const vendorRect = await readPanelRect(page, '#vendor-panel');
  const inventoryRect = await readPanelRect(page, '#inventory-panel');
  if (!vendorRect || !inventoryRect) {
    throw new Error(`${label}: missing vendor or inventory panel bounds`);
  }
  const viewport = {
    width: await page.evaluate(() => window.innerWidth),
    height: await page.evaluate(() => window.innerHeight),
  };
  if (!isClickableInViewport(vendorRect, viewport)) {
    throw new Error(`${label}: vendor panel is not fully inside viewport`);
  }
  if (!isClickableInViewport(inventoryRect, viewport)) {
    throw new Error(`${label}: inventory panel is not fully inside viewport`);
  }
  if (rectanglesOverlap(vendorRect, inventoryRect)) {
    throw new Error(`${label}: vendor and inventory panels overlap`);
  }
}

async function waitForVendorTradeLayoutStable(/** @type {any} */ page) {
  await page.waitForFunction(() => {
    /**
     * @param {string} selector
     * @returns {{ left: number, top: number, right: number, bottom: number, width: number, height: number } | null}
     */
    const readRect = (selector) => {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const vendor = readRect('#vendor-panel');
    const inventory = readRect('#inventory-panel');
    if (!vendor || !inventory) return false;
    /**
     * @param {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} rect
     */
    const insideViewport = (rect) =>
      rect.width > 2 &&
      rect.height > 2 &&
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= window.innerWidth &&
      rect.bottom <= window.innerHeight;
    const overlaps =
      vendor.left < inventory.right &&
      vendor.right > inventory.left &&
      vendor.top < inventory.bottom &&
      vendor.bottom > inventory.top;
    return insideViewport(vendor) && insideViewport(inventory) && !overlaps;
  }, null, { timeout: TEST_TIMEOUT_MS });
}

async function readPanelRect(/** @type {any} */ page, /** @type {any} */ selector) {
  return page.evaluate((/** @type {any} */ sel) => {
    const el = document.querySelector(sel);
    if (!(el instanceof HTMLElement)) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }, selector);
}

async function dragPanelBy(/** @type {any} */ page, /** @type {any} */ handleSelector, /** @type {any} */ dx, /** @type {any} */ dy) {
  await page.waitForSelector(handleSelector, { state: 'visible' });
  await page.evaluate(
    (/** @type {any} */ payload) => {
      const { selector, moveX, moveY } = payload;
      const handle = document.querySelector(selector);
      if (!(handle instanceof HTMLElement)) {
        throw new Error(`Drag handle not visible: ${selector}`);
      }
      const rect = handle.getBoundingClientRect();
      const startX = rect.left + Math.max(10, Math.min(24, rect.width - 10));
      const startY = rect.top + Math.max(8, Math.min(14, rect.height - 8));
      const pointerId = 1;
      const steps = 12;
      handle.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
        })
      );
      for (let i = 1; i <= steps; i += 1) {
        const nextX = startX + (moveX * i) / steps;
        const nextY = startY + (moveY * i) / steps;
        window.dispatchEvent(
          new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: nextX,
            clientY: nextY,
          })
        );
      }
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 0,
          clientX: startX + moveX,
          clientY: startY + moveY,
        })
      );
    },
    { selector: handleSelector, moveX: dx, moveY: dy }
  );
  await sleep(80);
}

function assertRectNear(
  /** @type {any} */ a,
  /** @type {any} */ b,
  /** @type {any} */ tolerancePx,
  /** @type {any} */ label
) {
  if (!a || !b) {
    throw new Error(`${label}: missing rectangle metrics`);
  }
  const leftDelta = Math.abs(a.left - b.left);
  const topDelta = Math.abs(a.top - b.top);
  const widthDelta = Math.abs(a.width - b.width);
  const heightDelta = Math.abs(a.height - b.height);
  if (leftDelta > tolerancePx || topDelta > tolerancePx || widthDelta > tolerancePx || heightDelta > tolerancePx) {
    throw new Error(
      `${label}: rect drift too high (left=${leftDelta.toFixed(1)} top=${topDelta.toFixed(1)} width=${widthDelta.toFixed(1)} height=${heightDelta.toFixed(1)})`
    );
  }
}

async function safeClick(/** @type {any} */ page, /** @type {any} */ selector, /** @type {any} */ timeout = TEST_TIMEOUT_MS) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
  try {
    await page.click(selector, { timeout });
  } catch (err) {
    await page.evaluate((/** @type {any} */ sel) => {
      const el = document.querySelector(sel);
      if (!(el instanceof HTMLElement)) {
        throw new Error(`safeClick target missing: ${sel}`);
      }
      el.click();
    }, selector);
  }
}

async function safeSetViewport(/** @type {any} */ page, /** @type {any} */ viewport) {
  try {
    await page.setViewportSize(viewport);
    return;
  } catch (err) {
    const message = String((/** @type {any} */ (err))?.message ?? err);
    if (!message.includes('setWindowBounds')) {
      throw err;
    }
  }
  await page.evaluate(() => {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      return document.exitFullscreen().catch(() => {});
    }
    return null;
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(100);
  await page.setViewportSize(viewport);
}

async function writeFailureArtifacts(/** @type {any} */ { page, stage, error }) {
  fs.mkdirSync(E2E_ARTIFACT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = `${stamp}-${sanitizeToken(stage)}`;
  const errorPath = path.join(E2E_ARTIFACT_DIR, `${prefix}.error.txt`);

  fs.writeFileSync(
    errorPath,
    [
      `stage: ${stage}`,
      `message: ${error?.message ?? String(error)}`,
      '',
      error?.stack ?? '',
    ].join('\n'),
    'utf8'
  );

  if (!page || page.isClosed()) return;

  const screenshotPath = path.join(E2E_ARTIFACT_DIR, `${prefix}.screenshot.png`);
  const statePath = path.join(E2E_ARTIFACT_DIR, `${prefix}.render-state.json`);
  const vendorMetricsPath = path.join(E2E_ARTIFACT_DIR, `${prefix}.vendor-metrics.json`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

  const stateText = await page
    .evaluate(() => {
      if (typeof window.render_game_to_text === 'function') {
        return window.render_game_to_text();
      }
      return null;
    })
    .catch(() => null);
  fs.writeFileSync(statePath, stateText ?? 'null', 'utf8');

  const metrics = await readVendorMetrics(page).catch(() => null);
  fs.writeFileSync(vendorMetricsPath, JSON.stringify(metrics, null, 2), 'utf8');
}

function summarizePlayer(/** @type {any} */ state) {
  const player = state?.player ?? {};
  return {
    x: Number(player.x?.toFixed?.(2) ?? player.x ?? NaN),
    z: Number(player.z?.toFixed?.(2) ?? player.z ?? NaN),
    hp: player.hp ?? null,
    inv: player.inv ?? null,
    currencyCopper: player.currencyCopper ?? null,
    dead: !!player.dead,
  };
}

function getInventoryItems(/** @type {any} */ state) {
  return Array.isArray(state?.inventory?.items) ? state.inventory.items : [];
}

function countInventoryKind(/** @type {any} */ state, /** @type {any} */ kind) {
  if (typeof kind !== 'string' || kind.length === 0) return 0;
  return getInventoryItems(state).reduce((total, item) => {
    if (!item || item.kind !== kind) return total;
    return total + Math.max(0, Math.floor(Number(item.count) || 0));
  }, 0);
}

function findInventoryItem(/** @type {any} */ state, /** @type {any} */ predicate) {
  return getInventoryItems(state).find((item) => predicate(item)) ?? null;
}

function getActiveContract(/** @type {any} */ state, /** @type {any} */ contractId) {
  if (typeof contractId !== 'string' || contractId.length === 0) return null;
  const activeContracts = Array.isArray(state?.player?.activeContracts) ? state.player.activeContracts : [];
  return activeContracts.find(
    (/** @type {any} */ contract) =>
      contract?.contractId === contractId || contract?.templateId === contractId
  ) ?? null;
}

function pickPreferredContractOffer(/** @type {any} */ state, /** @type {any} */ vendorId) {
  const offers = Array.isArray(state?.player?.contractOffersByVendor?.[vendorId])
    ? state.player.contractOffersByVendor[vendorId]
    : [];
  const herbCount = countInventoryKind(state, 'herb');
  const deliveryOffer = offers.find(
    (/** @type {any} */ offer) =>
      offer?.kind === 'delivery' &&
      countInventoryKind(state, offer.deliveryItemKind) >= (offer.deliveryItemCount ?? offer.requiredCount ?? 1)
  );
  if (deliveryOffer) return deliveryOffer;
  const craftOffer = offers.find(
    (/** @type {any} */ offer) =>
      offer?.kind === 'craft' &&
      offer.target === 'herb_health_potion' &&
      herbCount >= Math.max(4, (offer.requiredCount ?? 1) * 2)
  );
  if (craftOffer) return craftOffer;
  const gatherOffer = offers.find((/** @type {any} */ offer) => offer?.kind === 'gather');
  if (gatherOffer) return gatherOffer;
  return null;
}

function pickNearestResourceOfType(/** @type {any} */ state, /** @type {any} */ resourceType) {
  const player = state?.player ?? null;
  if (!player || typeof resourceType !== 'string' || resourceType.length === 0) return null;
  const resources = Array.isArray(state?.resources) ? state.resources : [];
  const obstacles = state?.world?.collisionObstacles ?? state?.world?.obstacles ?? [];
  const matching = resources.filter(
    (/** @type {any} */ resource) => resource?.available && resource.type === resourceType
  );
  if (matching.length === 0) return null;
  const visible = matching.filter((/** @type {any} */ resource) => hasLineOfSight(player, resource, obstacles));
  const pool = visible.length > 0 ? visible : matching;
  return pool.reduce((/** @type {any} */ closest, /** @type {any} */ resource) => {
    if (!closest) return resource;
    return distance(player, resource) < distance(player, closest) ? resource : closest;
  }, null);
}

async function clickVendorContractAction(/** @type {any} */ page, /** @type {any} */ title, /** @type {any} */ actionText) {
  await page.evaluate((/** @type {any} */ payload) => {
    const rows = Array.from(document.querySelectorAll('.vendor-contract-row'));
    for (const row of rows) {
      const titleEl = row.querySelector('.vendor-contract-title');
      const button = row.querySelector('button');
      const rowTitle = titleEl?.textContent?.trim() ?? '';
      const buttonText = button?.textContent?.trim() ?? '';
      if (rowTitle === payload.title && buttonText === payload.actionText) {
        button?.click();
        return;
      }
    }
    throw new Error(`Vendor contract action not found: ${payload.actionText} (${payload.title})`);
  }, { title, actionText });
}

async function completeGatherContract(
  /** @type {any} */ page,
  /** @type {any} */ contract
) {
  const contractId = contract?.contractId ?? contract?.templateId;
  if (!contractId || contract?.kind !== 'gather' || !contract?.target) {
    throw new Error('Gather contract payload is invalid');
  }

  let state = await getState(page);
  let active = getActiveContract(state, contractId);
  while (active && !active.completed) {
    const resource = pickNearestResourceOfType(state, contract.target);
    if (!resource) {
      throw new Error(`No available ${contract.target} resource found for gather contract`);
    }

    const beforeProgress = active.progress ?? 0;
    const beforeCount = countInventoryKind(state, contract.target);
    const harvestRadius = state.world?.harvestRadius ?? 2;

    await page.evaluate(
      (/** @type {any} */ point) => window.__game?.moveTo(point.x, point.z),
      resource
    );
    await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, resource) <= harvestRadius - 0.05,
      TEST_TIMEOUT_MS,
      `reach ${contract.target} resource`
    );

    await page.evaluate(() => window.__game?.interact());
    await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player?.harvest?.resourceId === resource.id,
      TEST_TIMEOUT_MS,
      `start ${contract.target} harvest`
    );
    await waitForCondition(
      page,
      (/** @type {any} */ s) => {
        const nextActive = getActiveContract(s, contractId);
        const nextResource = s.resources?.find((/** @type {any} */ entry) => entry.id === resource.id);
        return (
          (nextActive && (nextActive.progress ?? 0) > beforeProgress) ||
          (nextResource && !nextResource.available) ||
          countInventoryKind(s, contract.target) > beforeCount
        );
      },
      TEST_TIMEOUT_MS + 5000,
      `finish ${contract.target} harvest`
    );

    state = await getState(page);
    active = getActiveContract(state, contractId);
  }

  if (!active?.completed) {
    throw new Error(`Gather contract did not complete: ${contractId}`);
  }
  return state;
}

async function assertAliveBefore(/** @type {any} */ page, /** @type {any} */ label, /** @type {any} */ state = null) {
  const currentState = state ?? (await getState(page));
  if (!currentState?.player) {
    throw new Error(`Player state unavailable before ${label}`);
  }
  if (currentState.player.dead || currentState.player.hp <= 0) {
    throw new Error(
      `Player died before ${label}. Last player state: ${JSON.stringify(summarizePlayer(currentState))}`
    );
  }
  return currentState;
}

async function run() {
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

  let /** @type {any} */ browser = null;
  let /** @type {any} */ context = null;
  let /** @type {any} */ page = null;
  let stage = 'boot';

  try {
    stage = 'wait-server';
    await waitForServer(server);

    stage = 'launch-browser';
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });
    context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
    });
    page = await context.newPage();
    page.setDefaultTimeout(TEST_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(TEST_TIMEOUT_MS);
    await page.addInitScript(() => {
      if (!localStorage.getItem('e2e_clear_done')) {
        localStorage.clear();
        localStorage.setItem('e2e_clear_done', 'true');
      }
    });

    const /** @type {any} */ consoleErrors = [];
    const /** @type {any} */ ignoredErrorSnippets = [
      'WebGLRenderer: A WebGL context could not be created',
      'WebGLRenderer: Error creating WebGL context',
      'WebGL unavailable, falling back to canvas renderer.',
      'WebGL unavailable.',
    ];
    const shouldIgnoreError = (/** @type {any} */ text) =>
      ignoredErrorSnippets.some((/** @type {any} */ snippet) => text.includes(snippet));

    page.on('pageerror', (/** @type {any} */ err) => {
      const text = String(err);
      if (!shouldIgnoreError(text)) {
        consoleErrors.push(text);
      }
    });
    page.on('console', (/** @type {any} */ msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!shouldIgnoreError(text)) {
        consoleErrors.push(text);
      }
    });

    stage = 'auth-flow';
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');
    const username = 'e2e_tester';
    const password = 'e2e_password';
    const characterName = `Hero ${Date.now().toString(36)}`;

    await page.waitForSelector('#menu.open');
    await page.waitForSelector('#menu[data-progress=\"account\"]');
    await page.waitForFunction(
      () => !document.querySelector('#signin-form')?.classList.contains('hidden')
    );
    await page.focus('#signin-username');
    await page.keyboard.type(username);
    await page.keyboard.press('Tab');
    await page.keyboard.type(password);
    await page.keyboard.press('Enter');

    const signInResult = await waitForMenuStepOrError(page, 'characters', TEST_TIMEOUT_MS);
    if (!signInResult.ok) {
      throw new Error(`Sign-in failed: ${signInResult.errorText ?? 'unknown error'}`);
    }
    await page.waitForSelector('#menu[data-progress=\"character\"]');
    await page.waitForSelector('#menu-status');
    await page.focus('#character-create-open');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#menu[data-step=\"create\"]');
    await page.focus('#character-name');
    await page.keyboard.type(characterName);
    await page.selectOption('#character-class', 'fighter');
    const classPreview = await page.locator('#character-class-preview-blurb').innerText();
    if (!classPreview.toLowerCase().includes('frontline')) {
      throw new Error('Class preview did not update with class metadata blurb.');
    }
    await page.focus('#character-create-form button[type=\"submit\"]');
    await page.keyboard.press('Enter');

    const seenStages = new Set();
    let sawProgressSignal = false;
    let sawLoadingVisible = false;
    const stageCaptureStart = Date.now();
    while (Date.now() - stageCaptureStart < 6000) {
      const loadingState = await getLoadingScreenState(page);
      if (loadingState.visible) sawLoadingVisible = true;
      if (loadingState.stage) seenStages.add(loadingState.stage);
      if (loadingState.indeterminate || loadingState.progress != null) sawProgressSignal = true;
      if (sawLoadingVisible && !loadingState.visible) break;
      await sleep(120);
    }
    if (seenStages.size > 0) {
      if (!seenStages.has('Loading world assets')) {
        throw new Error(`Loading flow missing \"Loading world assets\" stage. Seen: ${Array.from(seenStages).join(', ')}`);
      }
      if (!seenStages.has('Connecting realm') && !seenStages.has('Syncing world state')) {
        throw new Error(`Loading flow missing connection/sync stage. Seen: ${Array.from(seenStages).join(', ')}`);
      }
      if (!sawProgressSignal) {
        throw new Error('Loading flow did not expose a visible progress signal.');
      }
    }
    await waitForLoadingScreenToDisappear(page);

    await page.waitForFunction(
      () => !document.querySelector('#menu')?.classList.contains('open')
    );
    await page.waitForFunction(() => !document.body.classList.contains('menu-open'));

    await page.waitForSelector('#ability-bar .ability-slot');
    const abilitySlotCount = await page.locator('#ability-bar .ability-slot').count();
    if (abilitySlotCount !== 10) {
      throw new Error(`Ability bar slot count mismatch: ${abilitySlotCount}`);
    }

    await page.waitForSelector('#overlay');
    const overlayText = await page.locator('#overlay').innerText();
    if (overlayText.includes('Rising Ages')) {
      throw new Error('Overlay still includes title text');
    }
    if (overlayText.toLowerCase().includes('account')) {
      throw new Error('Overlay still mentions account');
    }
    const characterLabel = await page.locator('#overlay-character-name').innerText();
    if (!characterLabel || characterLabel.trim() === '--') {
      throw new Error('Character name missing from overlay');
    }
    const hpOverlayValue = await page.locator('#overlay-hp-value').innerText();
    if (!hpOverlayValue.includes('/')) {
      throw new Error(`Overlay HP value not populated: "${hpOverlayValue}"`);
    }
    const portraitMetrics = await page.evaluate(() => {
      const el = document.querySelector('#overlay-portrait');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const pseudo = getComputedStyle(el, '::before');
      return {
        width: rect.width,
        height: rect.height,
        pseudoBackgroundImage: pseudo.backgroundImage,
      };
    });
    if (!portraitMetrics) {
      throw new Error('Overlay portrait missing');
    }
    if (Number(portraitMetrics.width ?? 0) < 20 || Number(portraitMetrics.height ?? 0) < 20) {
      throw new Error(
        `Overlay portrait not rendered at expected size: ${portraitMetrics.width}x${portraitMetrics.height}`
      );
    }
    if (
      !portraitMetrics.pseudoBackgroundImage ||
      !portraitMetrics.pseudoBackgroundImage.includes('player-head-static.svg')
    ) {
      throw new Error(
        `Overlay portrait static head image missing: "${portraitMetrics.pseudoBackgroundImage ?? ''}"`
      );
    }

    const controlsMetrics = await page.evaluate(() => {
      const el = document.querySelector('.overlay-controls');
      if (!el) return { opacity: null, height: null };
      return {
        opacity: getComputedStyle(el).opacity,
        height: el.getBoundingClientRect().height,
      };
    });
    if (!controlsMetrics.opacity || Number(controlsMetrics.height ?? 0) > 1) {
      throw new Error('Overlay controls should be hidden by default');
    }
    await page.dispatchEvent('#overlay', 'mouseenter');
    await page.waitForFunction(() => {
      const el = document.querySelector('#overlay');
      return el ? el.classList.contains('hovered') : false;
    });
    await page.evaluate(() => {
      const el = document.querySelector('#overlay');
      if (el && !el.classList.contains('hovered')) {
        el.classList.add('hovered');
      }
    });
    await page.waitForFunction(() => {
      const el = document.querySelector('.overlay-controls');
      if (!el) return false;
      return Number(el.getBoundingClientRect().height) >= 8;
    });
    const controlsMetricsHover = await page.evaluate(() => {
      const el = document.querySelector('.overlay-controls');
      if (!el) return { opacity: null, height: null };
      return {
        opacity: getComputedStyle(el).opacity,
        height: el.getBoundingClientRect().height,
      };
    });
    if (!controlsMetricsHover.opacity || Number(controlsMetricsHover.height ?? 0) < 8) {
      throw new Error('Overlay controls did not appear on hover');
    }

    await page.keyboard.press('k');
    await page.waitForSelector('#character-sheet-panel.open');
    await page.waitForFunction(() =>
      document.querySelector('#skills-list')?.textContent?.includes('Slash')
    );
    const skillsText = await page.locator('#skills-list').innerText();
    if (!skillsText.includes('Slash')) {
      throw new Error('Skills panel missing Slash');
    }
    await page.keyboard.press('k');
    await page.waitForFunction(
      () => !document.querySelector('#character-sheet-panel')?.classList.contains('open')
    );

    await page.keyboard.press('Escape');
    await page.waitForSelector('#pause-menu.open');
    await safeClick(page, '#pause-character-btn');
    await page.waitForSelector('#menu.open');
    await page.waitForSelector('#menu[data-step=\"characters\"]');
    await page.waitForSelector('#menu[data-progress=\"character\"]');
    const continueName = (await page.locator('#menu-continue-name').innerText()).trim();
    if (!continueName || continueName === '--') {
      throw new Error('Smart continue did not render a valid character name.');
    }
    await safeClick(page, '#menu-continue-btn');
    await page.waitForFunction(
      () => document.querySelector('#loading-screen')?.classList.contains('visible') === true,
      { timeout: 5000 }
    );
    await waitForLoadingScreenToDisappear(page);
    await page.waitForFunction(
      () => !document.querySelector('#menu')?.classList.contains('open')
    );
    await page.waitForFunction(() => !document.body.classList.contains('menu-open'));

    let state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.resources?.length > 0 && s.mobs?.length > 0,
      TEST_TIMEOUT_MS,
      'initial state'
    );
    state = await assertAliveBefore(page, 'movement checks', state);
    console.log(`Initial resources: ${state.resources.length}, mobs: ${state.mobs.length}`);
    if (state.player?.movementMode !== 'sprint' || state.player?.walking !== false) {
      throw new Error('Player should start in sprint mode.');
    }
    const sprintSpeed = Number(state.player?.movementSpeed ?? 0);
    if (!(sprintSpeed > 0)) {
      throw new Error(`Expected positive sprint speed, got ${state.player?.movementSpeed}.`);
    }

    const /** @type {any} */ sprintStartPos = { x: state.player.x, z: state.player.z };
    await page.keyboard.down('w');
    await sleep(300);
    await advance(page, 700);
    await page.keyboard.up('w');

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, sprintStartPos) > 0.5,
      TEST_TIMEOUT_MS,
      'movement'
    );
    const sprintDistance = distance(state.player, sprintStartPos);

    await page.keyboard.press('CapsLock');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player?.movementMode === 'walk' &&
        s.player?.walking === true &&
        Number(s.player?.movementSpeed ?? 0) > 0 &&
        Number(s.player?.movementSpeed ?? 0) < sprintSpeed,
      TEST_TIMEOUT_MS,
      'walk mode toggle'
    );
    const walkSpeed = Number(state.player?.movementSpeed ?? 0);

    const /** @type {any} */ walkStartPos = { x: state.player.x, z: state.player.z };
    await page.keyboard.down('w');
    await sleep(300);
    await advance(page, 700);
    await page.keyboard.up('w');

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, walkStartPos) > 0.4,
      TEST_TIMEOUT_MS,
      'walk movement'
    );
    const walkDistance = distance(state.player, walkStartPos);
    if (!(walkDistance < sprintDistance)) {
      throw new Error(
        `Walk should be slower than sprint. distance=${walkDistance.toFixed(2)} sprintDistance=${sprintDistance.toFixed(2)} walkSpeed=${walkSpeed.toFixed(2)} sprintSpeed=${sprintSpeed.toFixed(2)}`
      );
    }

    await page.keyboard.press('CapsLock');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player?.movementMode === 'sprint' && s.player?.walking === false,
      TEST_TIMEOUT_MS,
      'sprint mode restore'
    );
    state = await assertAliveBefore(page, 'collision checks', state);
    await page.evaluate(() => window.__game?.clearInput());

    const collidableStructures = (state.world?.structures ?? []).filter(
      (/** @type {any} */ structure) =>
        structure?.collides !== false && Number.isFinite(structure?.colliderRadius) && structure.colliderRadius > 0
    );
    const blockingStructure =
      collidableStructures.find((/** @type {any} */ structure) => structure.kind === 'market') ??
      collidableStructures[0] ??
      null;
    if (blockingStructure) {
      await page.evaluate(
        (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
        { x: blockingStructure.x, z: blockingStructure.z }
      );
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) =>
          s.player && distance(s.player, blockingStructure) <= (blockingStructure.colliderRadius ?? 0) + 1.6,
        TEST_TIMEOUT_MS,
        'approach collidable structure'
      );
      await advance(page, 1000);
      await sleep(100);
      state = await getState(page);
      const minDistance = (blockingStructure.colliderRadius ?? 0) + 0.45;
      const actualDistance = distance(state.player, blockingStructure);
      if (actualDistance < minDistance) {
        throw new Error(
          `Player crossed structure collision boundary (${actualDistance.toFixed(2)} < ${minDistance.toFixed(2)}).`
        );
      }
    }

    const fenceStructure =
      collidableStructures.find((/** @type {any} */ structure) => structure.kind === 'fence') ??
      null;
    if (fenceStructure) {
      await page.evaluate(
        (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
        { x: fenceStructure.x, z: fenceStructure.z }
      );
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) =>
          s.player && distance(s.player, fenceStructure) <= (fenceStructure.colliderRadius ?? 0) + 1.6,
        TEST_TIMEOUT_MS,
        'approach collidable fence'
      );
      await advance(page, 900);
      await sleep(100);
      state = await getState(page);
      const minDistance = (fenceStructure.colliderRadius ?? 0) + 0.4;
      const actualDistance = distance(state.player, fenceStructure);
      if (actualDistance < minDistance) {
        throw new Error(
          `Player crossed fence collision boundary (${actualDistance.toFixed(2)} < ${minDistance.toFixed(2)}).`
        );
      }
    }

    const harvestRadius = state.world?.harvestRadius ?? 2;
    state = await assertAliveBefore(page, 'harvest setup', state);
    let /** @type {any} */ resource = null;
    const testResource = state.resources.find((/** @type {any} */ r) => r.id === 'r-test');
    if (testResource) {
      console.log(`Test resource at (${testResource.x.toFixed(2)}, ${testResource.z.toFixed(2)})`);
    } else {
      console.log('Test resource not found');
    }
    if (testResource && testResource.available) {
      await page.evaluate(
        (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
        { x: testResource.x, z: testResource.z }
      );
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => s.player && distance(s.player, testResource) <= harvestRadius - 0.05,
        TEST_TIMEOUT_MS,
        'reach test resource'
      );
      resource = testResource;
    }

    const availableResources = state.resources.filter((/** @type {any} */ r) => r.available);
    if (availableResources.length === 0) {
      throw new Error('No available resource found');
    }
    const obstacles = state.world?.collisionObstacles ?? state.world?.obstacles ?? [];
    const visibleResources = availableResources.filter((/** @type {any} */ r) =>
      hasLineOfSight(state.player, r, obstacles)
    );
    const candidates = visibleResources.length ? visibleResources : availableResources;
    const sortedResources = candidates.sort(
      (/** @type {any} */ a, /** @type {any} */ b) => distance(state.player, a) - distance(state.player, b)
    );

    let /** @type {any} */ lastReachError = null;
    for (const candidate of sortedResources.slice(0, 5)) {
      if (resource) break;
      const distToResource = distance(state.player, candidate);
      const reachTimeoutMs = Math.max(
        TEST_TIMEOUT_MS,
        Math.ceil((distToResource / 3) * 1000 + 5000)
      );

      await page.evaluate(
        (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
        { x: candidate.x, z: candidate.z }
      );
      let /** @type {any} */ reached = null;
      try {
        reached = await waitForCondition(
          page,
          (/** @type {any} */ s) => s.player && distance(s.player, candidate) <= harvestRadius + 0.6,
          reachTimeoutMs,
          `reach resource ${candidate.id}`
        );
      } catch (err) {
        lastReachError = err;
        continue;
      }

      if (distance(reached.player, candidate) <= harvestRadius - 0.05) {
        resource = candidate;
        state = reached;
        break;
      }
    }

    if (!resource) {
      if (lastReachError) throw lastReachError;
      throw new Error('Could not reach a resource within harvest radius');
    }
    console.log(`Selected resource ${resource.id}`);
    console.log(
      `Player at (${state.player.x.toFixed(2)}, ${state.player.z.toFixed(2)}) ` +
        `distance=${distance(state.player, resource).toFixed(2)}`
    );

    const harvestDurationMs = state.world?.harvestDurationMs ?? 2500;
    const invBefore = state.player.inv;
    await page.evaluate(() => window.__game?.interact());
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player &&
        s.player.harvest &&
        s.player.harvest.resourceId === resource.id,
      TEST_TIMEOUT_MS,
      'harvest channel start'
    );
    await advance(page, 1000 / 30);
    await sleep(50);
    await assertHarvestProgressHudPlacement(page, 'harvest HUD placement');
    const preCompleteAdvance = Math.max(200, harvestDurationMs - 450);
    await advance(page, preCompleteAdvance);
    state = await getState(page);
    if ((state?.player?.inv ?? 0) !== invBefore) {
      throw new Error('Inventory increased before timed harvest completed');
    }
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.player.inv === invBefore + 1,
      TEST_TIMEOUT_MS + harvestDurationMs,
      'harvest completion'
    );
    state = await assertAliveBefore(page, 'inventory/equipment checks', state);

    const updatedResource = state.resources.find((/** @type {any} */ r) => r.id === resource.id);
    if (!updatedResource || updatedResource.available) {
      throw new Error('Resource did not become unavailable after harvest');
    }

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory open'
    );
    const inventorySoloRect = await readPanelRect(page, '#inventory-panel');
    if (!inventorySoloRect) {
      throw new Error('Inventory panel rect unavailable after opening inventory');
    }
    const inventoryCompactWidth = inventorySoloRect.width;
    if (inventoryCompactWidth < 280 || inventoryCompactWidth > 340) {
      throw new Error(`Inventory compact width out of expected range: ${inventoryCompactWidth.toFixed(1)}px`);
    }

    await page.keyboard.press('c');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.skills?.open,
      TEST_TIMEOUT_MS,
      'character panel open'
    );
    await page.waitForSelector('#character-view.active');
    const inventoryWithCharacterRect = await readPanelRect(page, '#inventory-panel');
    assertRectNear(inventoryWithCharacterRect, inventorySoloRect, 2.5, 'inventory layout with character panel');

    await dragPanelBy(page, '#inventory-panel .inventory-header', 120, 56);
    const inventoryDraggedRect = await readPanelRect(page, '#inventory-panel');
    if (!inventoryDraggedRect) {
      throw new Error('Inventory panel rect unavailable after drag');
    }
    const inventoryMovedDx = Math.abs(inventoryDraggedRect.left - inventoryWithCharacterRect.left);
    const inventoryMovedDy = Math.abs(inventoryDraggedRect.top - inventoryWithCharacterRect.top);
    if (inventoryMovedDx < 20 && inventoryMovedDy < 20) {
      throw new Error('Inventory panel did not move after drag');
    }
    if (!isClickableInViewport(inventoryDraggedRect, DESKTOP_VIEWPORT)) {
      throw new Error('Inventory panel moved outside viewport bounds');
    }

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => !s.inventory?.open && s.skills?.open,
      TEST_TIMEOUT_MS,
      'inventory close while character open'
    );
    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.open && s.skills?.open,
      TEST_TIMEOUT_MS,
      'inventory reopen while character open'
    );
    await page.waitForFunction(() => document.getElementById('inventory-panel')?.classList.contains('window-dragged'));
    await sleep(220);
    const inventoryReopenedRect = await readPanelRect(page, '#inventory-panel');
    assertRectNear(inventoryReopenedRect, inventoryDraggedRect, 48, 'inventory session position memory');

    const characterBeforeDragRect = await readPanelRect(page, '#character-sheet-panel');
    await dragPanelBy(page, '#character-sheet-panel .character-sheet-header', -84, 48);
    const characterAfterDragRect = await readPanelRect(page, '#character-sheet-panel');
    if (!characterBeforeDragRect || !characterAfterDragRect) {
      throw new Error('Character panel rect unavailable for drag check');
    }
    const characterMovedDx = Math.abs(characterAfterDragRect.left - characterBeforeDragRect.left);
    const characterMovedDy = Math.abs(characterAfterDragRect.top - characterBeforeDragRect.top);
    if (characterMovedDx < 20 && characterMovedDy < 20) {
      throw new Error('Character panel did not move after drag');
    }
    const characterCenterX = characterAfterDragRect.left + characterAfterDragRect.width / 2;
    const characterCenterY = characterAfterDragRect.top + characterAfterDragRect.height / 2;
    if (
      characterCenterX < 0 ||
      characterCenterX > DESKTOP_VIEWPORT.width ||
      characterCenterY < 0 ||
      characterCenterY > DESKTOP_VIEWPORT.height
    ) {
      throw new Error('Character panel center moved outside viewport bounds');
    }

    await page.evaluate(() => {
      const panel = document.getElementById('trade-panel');
      panel?.classList.remove('hidden');
    });
    await page.waitForSelector('#trade-panel:not(.hidden)');
    const tradeBeforeDragRect = await readPanelRect(page, '#trade-panel');
    await dragPanelBy(page, '#trade-panel .trade-header', 96, -36);
    const tradeAfterDragRect = await readPanelRect(page, '#trade-panel');
    if (!tradeBeforeDragRect || !tradeAfterDragRect) {
      throw new Error('Trade panel rect unavailable for drag check');
    }
    const tradeMovedDx = Math.abs(tradeAfterDragRect.left - tradeBeforeDragRect.left);
    const tradeMovedDy = Math.abs(tradeAfterDragRect.top - tradeBeforeDragRect.top);
    if (tradeMovedDx < 20 && tradeMovedDy < 20) {
      throw new Error('Trade panel did not move after drag');
    }
    if (!isWithinViewport(tradeAfterDragRect, DESKTOP_VIEWPORT, 12)) {
      throw new Error('Trade panel moved outside viewport bounds');
    }
    await page.evaluate(() => {
      const panel = document.getElementById('trade-panel');
      panel?.classList.add('hidden');
    });
    await page.waitForFunction(() => document.getElementById('trade-panel')?.classList.contains('hidden'));

    const equipSlotCount = await page.locator('#equipment-grid .equipment-slot').count();
    if (equipSlotCount !== 6) {
      throw new Error(`Equipment slot count mismatch: ${equipSlotCount}`);
    }
    await page.locator('#inventory-panel').scrollIntoViewIfNeeded();

    const items = Array.isArray(state.inventory?.items) ? state.inventory.items : [];
    if (items.length === 0) {
      throw new Error('No inventory items after harvest');
    }
    const fromSlot = items[0].slot;
    const slotCount = state.inventory?.slots ?? 0;
    const occupied = new Set(items.map((/** @type {any} */ item) => item.slot));
    let /** @type {any} */ toSlot = null;
    for (let i = 0; i < slotCount; i += 1) {
      if (!occupied.has(i)) {
        toSlot = i;
        break;
      }
    }
    if (toSlot === null) {
      throw new Error('No empty inventory slot for swap test');
    }

    await page.evaluate(
      (/** @type {any} */ payload) => window.__game?.inventorySwap?.(payload.from, payload.to),
      { from: fromSlot, to: toSlot }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        Array.isArray(s.inventory?.items) &&
        s.inventory.items.some((/** @type {any} */ item) => item.slot === toSlot) &&
        !s.inventory.items.some((/** @type {any} */ item) => item.slot === fromSlot),
      TEST_TIMEOUT_MS,
      'inventory swap'
    );

    const weaponSlotLoc = page.locator('.equipment-slot[data-slot="weapon"]');
    const emptySlot = fromSlot;
    const emptySlotEl = page.locator(`.inventory-slot[data-index="${emptySlot}"]`);
    await emptySlotEl.scrollIntoViewIfNeeded();
    await weaponSlotLoc.scrollIntoViewIfNeeded();
    if ((await weaponSlotLoc.count()) === 0 || (await emptySlotEl.count()) === 0) {
      throw new Error('Weapon slot or empty inventory slot not found');
    }

    await page.evaluate(
      (/** @type {any} */ payload) => window.__game?.equipSwap?.(payload),
      {
        fromType: 'equipment',
        fromSlot: 'weapon',
        toType: 'inventory',
        toSlot: emptySlot,
      }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.inventory?.items?.some((/** @type {any} */ item) => item.kind?.startsWith('weapon_')),
      TEST_TIMEOUT_MS,
      'unequip weapon'
    );

    const weaponItemSlot =
      state.inventory.items.find((/** @type {any} */ item) => item.kind?.startsWith('weapon_'))?.slot ??
      emptySlot;
    const weaponItemSlotEl = page.locator(
      `.inventory-slot[data-index="${weaponItemSlot}"]`
    );
    if ((await weaponItemSlotEl.count()) === 0) {
      throw new Error('Weapon inventory slot not found for re-equip');
    }
    await page.evaluate(
      (/** @type {any} */ payload) => window.__game?.equipSwap?.(payload),
      {
        fromType: 'inventory',
        fromSlot: weaponItemSlot,
        toType: 'equipment',
        toSlot: 'weapon',
      }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player?.equipment?.weapon?.kind?.startsWith('weapon_'),
      TEST_TIMEOUT_MS,
      're-equip weapon'
    );

    await page.keyboard.press('c');
    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => !s.inventory?.open && !s.skills?.open,
      TEST_TIMEOUT_MS,
      'panels closed'
    );
    state = await assertAliveBefore(page, 'vendor desktop checks', state);

    stage = 'vendor-trade-desktop';
    let vendor = state.world?.vendors?.[0];
    if (!vendor) {
      throw new Error('No vendor found in world snapshot');
    }
    await page.evaluate(
      (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
      { x: vendor.x, z: vendor.z }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player &&
        distance(s.player, vendor) <= (s.world?.vendorInteractRadius ?? 2.5) - 0.05,
      TEST_TIMEOUT_MS,
      'reach vendor'
    );

    await page.keyboard.press('e');
    await page.waitForSelector('#vendor-dialog.open');
    await safeClick(page, '#vendor-trade-btn');
    await page.waitForSelector('#vendor-panel.open');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory open during vendor trade'
    );
    await page.waitForFunction(() => document.getElementById('inventory-panel')?.classList.contains('window-dragged'));
    await waitForVendorTradeLayoutStable(page);
    await assertVendorControlsInViewport(page, 'desktop vendor layout');
    await assertVendorTradePanelsSeparated(page, 'desktop vendor layout');

    const vendorBeforeDragMetrics = await readVendorMetrics(page);
    await dragPanelBy(page, '#vendor-panel .vendor-header', 92, 58);
    const vendorAfterDragMetrics = await readVendorMetrics(page);
    if (!vendorBeforeDragMetrics.panel || !vendorAfterDragMetrics.panel) {
      throw new Error('Vendor panel rect unavailable for drag check');
    }
    if (!isClickableInViewport(vendorAfterDragMetrics.panel, vendorAfterDragMetrics.viewport)) {
      throw new Error('Vendor panel moved outside viewport bounds');
    }
    await assertVendorTradePanelsSeparated(page, 'desktop vendor layout after drag attempt');

    await safeSetViewport(page, { width: 1120, height: 680 });
    await page.waitForFunction(
      (/** @type {any} */ viewport) =>
        window.innerWidth === viewport.width && window.innerHeight === viewport.height,
      { width: 1120, height: 680 }
    );
    await waitForVendorTradeLayoutStable(page);
    await assertVendorControlsInViewport(page, 'desktop vendor layout after resize');
    await assertVendorTradePanelsSeparated(page, 'desktop vendor layout after resize');
    await safeSetViewport(page, DESKTOP_VIEWPORT);
    await page.waitForFunction(
      (/** @type {any} */ viewport) =>
        window.innerWidth === viewport.width && window.innerHeight === viewport.height,
      DESKTOP_VIEWPORT
    );
    await waitForVendorTradeLayoutStable(page);
    await assertVendorControlsInViewport(page, 'desktop vendor layout after viewport restore');
    await assertVendorTradePanelsSeparated(page, 'desktop vendor layout after viewport restore');

    stage = 'vendor-contract-flow';
    await safeClick(page, '.vendor-tab[data-tab="contracts"]');
    await page.waitForFunction(() => {
      const contractsView = document.querySelector('.vendor-contracts');
      return contractsView?.classList.contains('active');
    });
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        Array.isArray(s.player?.contractOffersByVendor?.[vendor.id]) &&
        s.player.contractOffersByVendor[vendor.id].length > 0,
      TEST_TIMEOUT_MS,
      'contract offers'
    );
    const contractOffer = pickPreferredContractOffer(state, vendor.id);
    if (!contractOffer) {
      throw new Error('No supported vendor contract offer available for E2E coverage');
    }
    const contractXpBefore = state.player?.xp ?? 0;
    const contractCopperBefore = state.player?.currencyCopper ?? 0;

    await clickVendorContractAction(page, contractOffer.title, 'Accept');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => !!getActiveContract(s, contractOffer.id),
      TEST_TIMEOUT_MS,
      `accept contract ${contractOffer.id}`
    );
    let activeContract = getActiveContract(state, contractOffer.id);
    if (!activeContract) {
      throw new Error(`Accepted contract missing from state: ${contractOffer.id}`);
    }
    await page.waitForFunction(
      (/** @type {any} */ title) => {
        const tracker = document.getElementById('objective-tracker');
        return (
          tracker &&
          !tracker.classList.contains('hidden') &&
          (tracker.textContent ?? '').includes(title)
        );
      },
      contractOffer.title
    );
    await safeClick(page, '.inventory-tab[data-tab="journal"]');
    await page.waitForFunction(() =>
      document.getElementById('journal-view')?.classList.contains('active')
    );
    await page.waitForFunction(
      (/** @type {any} */ title) =>
        document.getElementById('journal-root')?.textContent?.includes(title),
      contractOffer.title
    );
    await safeClick(page, '.inventory-tab[data-tab="inventory"]');

    if (activeContract.kind === 'craft') {
      await safeClick(page, '#vendor-panel-close');
      await page.waitForFunction(
        () =>
          !document.querySelector('#vendor-panel')?.classList.contains('open') &&
          !document.body.classList.contains('trade-open') &&
          !document.body.classList.contains('vendor-layout-open')
      );
      await page.evaluate(() => window.__game?.craft?.('herb_health_potion', 2));
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => !!getActiveContract(s, contractOffer.id)?.completed,
        TEST_TIMEOUT_MS,
        `complete craft contract ${contractOffer.id}`
      );
      await page.keyboard.press('e');
      await page.waitForSelector('#vendor-dialog.open');
      await safeClick(page, '#vendor-trade-btn');
      await page.waitForSelector('#vendor-panel.open');
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => s.inventory?.open,
        TEST_TIMEOUT_MS,
        'inventory reopen for contract turn-in'
      );
      await safeClick(page, '.vendor-tab[data-tab="contracts"]');
      await page.waitForFunction(() => {
        const contractsView = document.querySelector('.vendor-contracts');
        return contractsView?.classList.contains('active');
      });
      activeContract = getActiveContract(state, contractOffer.id);
    } else if (activeContract.kind === 'gather') {
      await safeClick(page, '#vendor-panel-close');
      await page.waitForFunction(
        () =>
          !document.querySelector('#vendor-panel')?.classList.contains('open') &&
          !document.body.classList.contains('trade-open') &&
          !document.body.classList.contains('vendor-layout-open')
      );
      state = await completeGatherContract(page, activeContract);
      await page.evaluate(
        (/** @type {any} */ point) => window.__game?.moveTo(point.x, point.z),
        vendor
      );
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) =>
          s.player &&
          distance(s.player, vendor) <= (s.world?.vendorInteractRadius ?? 2.5) - 0.05,
        TEST_TIMEOUT_MS,
        'return to vendor for contract turn-in'
      );
      await page.keyboard.press('e');
      await page.waitForSelector('#vendor-dialog.open');
      await safeClick(page, '#vendor-trade-btn');
      await page.waitForSelector('#vendor-panel.open');
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => s.inventory?.open,
        TEST_TIMEOUT_MS,
        'inventory reopen after gather contract'
      );
      await waitForVendorTradeLayoutStable(page);
      await safeClick(page, '.vendor-tab[data-tab="contracts"]');
      await page.waitForFunction(() => {
        const contractsView = document.querySelector('.vendor-contracts');
        return contractsView?.classList.contains('active');
      });
      activeContract = getActiveContract(state, contractOffer.id);
    }

    if (!getActiveContract(state, contractOffer.id)?.completed) {
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => !!getActiveContract(s, contractOffer.id)?.completed,
        TEST_TIMEOUT_MS,
        `completed contract ${contractOffer.id}`
      );
    }

    await clickVendorContractAction(page, contractOffer.title, 'Turn In');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => !getActiveContract(s, contractOffer.id),
      TEST_TIMEOUT_MS,
      `turn in contract ${contractOffer.id}`
    );
    if (
      (state.player?.currencyCopper ?? 0) <= contractCopperBefore &&
      (state.player?.xp ?? 0) <= contractXpBefore
    ) {
      throw new Error('Contract turn-in did not update currency or XP');
    }

    await safeClick(page, '.vendor-tab[data-tab=\"sell\"]');
    await page.waitForFunction(() => {
      const sell = document.querySelector('.vendor-sell');
      return sell?.classList.contains('active');
    });

    state = await getState(page);
    const sellItems = Array.isArray(state.inventory?.items) ? state.inventory.items : [];
    if (sellItems.length === 0) {
      throw new Error('No inventory items available to sell');
    }
    const sellItem =
      sellItems.find((/** @type {any} */ item) => item.kind === 'crystal') ??
      sellItems.find((/** @type {any} */ item) => item.kind === 'herb') ??
      sellItems.find((/** @type {any} */ item) => !['ore', 'wood'].includes(item.kind)) ??
      sellItems[0];
    const sellSlot = sellItem.slot;
    const sellKind = sellItem.kind;
    const sellCount = sellItem.count ?? 1;
    const currencyBefore = state.player?.currencyCopper ?? 0;

    await page.evaluate(
      (/** @type {any} */ payload) => window.__game?.vendorSell?.(payload.slot, payload.vendorId),
      { slot: sellSlot, vendorId: vendor.id }
    );

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        (s.player?.currencyCopper ?? 0) > currencyBefore &&
        !s.inventory?.items?.some((/** @type {any} */ item) => item.slot === sellSlot),
      TEST_TIMEOUT_MS,
      'vendor sell'
    );
    const currencyAfter = state.player?.currencyCopper ?? 0;
    const expectedIncrease = sellCount * getSellPriceCopper(sellKind);
    if (currencyAfter - currencyBefore !== expectedIncrease) {
      throw new Error(
        `Currency mismatch. Expected +${expectedIncrease}, got +${currencyAfter - currencyBefore}`
      );
    }

    await safeClick(page, '#vendor-panel-close');
    await page.waitForFunction(
      () =>
        !document.querySelector('#vendor-panel')?.classList.contains('open') &&
        !document.querySelector('#inventory-panel')?.classList.contains('open') &&
        !document.body.classList.contains('trade-open') &&
        !document.body.classList.contains('vendor-layout-open')
    );
    state = await getState(page);
    stage = 'station-crafting';
    const forge = state.world?.structures?.find((/** @type {any} */ structure) => structure.kind === 'barracks');
    if (!forge) {
      throw new Error('No barracks structure available for forge crafting checks');
    }
    await page.evaluate(
      (/** @type {any} */ point) => window.__game?.moveTo(point.x, point.z),
      forge
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player && distance(s.player, forge) <= 4.4,
      TEST_TIMEOUT_MS,
      'reach forge station'
    );
    const wrongStationCountBefore = countInventoryKind(state, 'weapon_reinforced_training_bow');
    await page.evaluate(() => window.__game?.craft?.('woodcraft_reinforced_bow', 1));
    await advance(page, 600);
    await sleep(80);
    state = await getState(page);
    if (countInventoryKind(state, 'weapon_reinforced_training_bow') !== wrongStationCountBefore) {
      throw new Error('Wrong-station craft unexpectedly succeeded at forge');
    }

    const ironBladeCountBefore = countInventoryKind(state, 'weapon_iron_blade');
    await page.evaluate(() => window.__game?.craft?.('smith_iron_blade', 1));
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => countInventoryKind(s, 'weapon_iron_blade') >= ironBladeCountBefore + 1,
      TEST_TIMEOUT_MS,
      'forge crafting'
    );
    const craftedBlade = findInventoryItem(
      state,
      (/** @type {any} */ item) => item.kind === 'weapon_iron_blade'
    );
    if (!craftedBlade) {
      throw new Error('Crafted iron blade not found in inventory');
    }
    await page.evaluate(
      (/** @type {any} */ slot) =>
        window.__game?.equipSwap?.({
          fromType: 'inventory',
          fromSlot: slot,
          toType: 'equipment',
          toSlot: 'weapon',
        }),
      craftedBlade.slot
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player?.equipment?.weapon?.kind === 'weapon_iron_blade',
      TEST_TIMEOUT_MS,
      'equip crafted iron blade'
    );
    await page.evaluate(() => window.__game?.craft?.('smith_iron_blade', 1));
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => countInventoryKind(s, 'weapon_iron_blade') >= ironBladeCountBefore + 1,
      TEST_TIMEOUT_MS,
      'forge crafting spare blade'
    );
    const spareCraftedBlade = findInventoryItem(
      state,
      (/** @type {any} */ item) => item.kind === 'weapon_iron_blade'
    );
    if (!spareCraftedBlade) {
      throw new Error('Expected a spare crafted iron blade for salvage coverage');
    }
    const oreBeforeForgeSalvage = countInventoryKind(state, 'ore');
    const woodBeforeForgeSalvage = countInventoryKind(state, 'wood');
    await page.evaluate(
      (/** @type {any} */ slot) => window.__game?.salvageItem?.(slot),
      spareCraftedBlade.slot
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => {
        const itemStillPresent = getInventoryItems(s).some(
          (/** @type {any} */ item) => item.slot === spareCraftedBlade.slot && item.kind === 'weapon_iron_blade'
        );
        return (
          !itemStillPresent &&
          (countInventoryKind(s, 'ore') > oreBeforeForgeSalvage || countInventoryKind(s, 'wood') > woodBeforeForgeSalvage)
        );
      },
      TEST_TIMEOUT_MS,
      'salvage crafted spare blade'
    );
    const nearbyVendor =
      state.world?.vendors?.reduce((/** @type {any} */ closest, /** @type {any} */ candidate) => {
        if (!closest) return candidate;
        return distance(state.player, candidate) < distance(state.player, closest)
          ? candidate
          : closest;
      }, null) ?? null;
    if (nearbyVendor) {
      vendor = nearbyVendor;
    }
    state = await assertAliveBefore(page, 'vendor small viewport checks');

    stage = 'vendor-trade-small-viewport';
    await safeSetViewport(page, SMALL_VIEWPORT);
    await page.waitForFunction(
      (/** @type {any} */ viewport) =>
        window.innerWidth === viewport.width && window.innerHeight === viewport.height,
      SMALL_VIEWPORT
    );
    await page.evaluate(
      (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
      { x: vendor.x, z: vendor.z }
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player &&
        distance(s.player, vendor) <= (s.world?.vendorInteractRadius ?? 2.5) - 0.05,
      TEST_TIMEOUT_MS,
      'reach vendor for small viewport checks'
    );
    state = await assertAliveBefore(page, 'vendor small viewport checks', state);
    await page.keyboard.press('e');
    await page.waitForSelector('#vendor-dialog.open');
    await safeClick(page, '#vendor-trade-btn');
    await page.waitForSelector('#vendor-panel.open');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory open during small viewport vendor trade'
    );
    await page.waitForFunction(() => {
      const panel = document.getElementById('vendor-panel');
      if (!(panel instanceof HTMLElement)) return false;
      const rect = panel.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
    await waitForVendorTradeLayoutStable(page);
    await assertVendorControlsInViewport(page, 'small viewport vendor layout');
    await assertVendorTradePanelsSeparated(page, 'small viewport vendor layout');
    await safeClick(page, '.vendor-tab[data-tab=\"buy\"]');
    await page.waitForFunction(() => {
      const buy = document.querySelector('.vendor-buy');
      return buy?.classList.contains('active');
    });
    await safeClick(page, '.vendor-tab[data-tab=\"sell\"]');
    await page.waitForFunction(() => {
      const sell = document.querySelector('.vendor-sell');
      return sell?.classList.contains('active');
    });
    await safeClick(page, '#vendor-panel-close');
    await page.waitForFunction(
      () =>
        !document.querySelector('#vendor-panel')?.classList.contains('open') &&
        !document.body.classList.contains('trade-open') &&
        !document.body.classList.contains('vendor-layout-open')
    );
    await safeSetViewport(page, DESKTOP_VIEWPORT);
    await page.waitForFunction(
      (/** @type {any} */ viewport) =>
        window.innerWidth === viewport.width && window.innerHeight === viewport.height,
      DESKTOP_VIEWPORT
    );
    state = await assertAliveBefore(page, 'targeting and combat checks');

    stage = 'targeting-and-combat';
    const vendorClickTarget = state.world?.vendors?.[0];
    if (!vendorClickTarget) {
      throw new Error('No vendor available for targeting');
    }
    await page.evaluate(
      (/** @type {any} */ vendor) => window.__game?.selectTarget?.({ kind: 'vendor', id: vendor.id }),
      vendorClickTarget
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.target?.kind === 'vendor' && s.target?.id === vendorClickTarget.id,
      TEST_TIMEOUT_MS,
      'vendor target'
    );
    await advance(page, 1000 / 30);
    await sleep(50);
    await page.waitForFunction(() =>
      document.querySelector('#target-hud')?.classList.contains('visible')
    );
    const vendorHudName = await page.locator('#target-name').innerText();
    if (vendorHudName.trim() !== vendorClickTarget.name) {
      throw new Error(
        `Vendor HUD name mismatch. Expected "${vendorClickTarget.name}", got "${vendorHudName}"`
      );
    }
    const vendorHudMeta = await page.locator('#target-meta').innerText();
    if (!vendorHudMeta.includes('Vendor')) {
      throw new Error(`Vendor HUD meta missing: "${vendorHudMeta}"`);
    }

    state = await getState(page);

    const attackTarget =
      state.mobs.find((/** @type {any} */ m) => m.id === 'm-test' && !m.dead) ??
      state.mobs.find((/** @type {any} */ m) => !m.dead);
    if (!attackTarget) {
      throw new Error('No alive mob available for attack test');
    }
    const classId = state.player?.classId ?? 'fighter';
    const attackRange =
      state.player?.weapon?.range ??
      (['ranger', 'priest', 'mage'].includes(classId) ? 6 : 2);
    const attackReachThreshold = Math.max(0.2, attackRange - 0.1);
    const /** @type {any} */ attackMoveTarget = { x: attackTarget.x, z: attackTarget.z };
    await page.evaluate(
      (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
      attackMoveTarget
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, attackMoveTarget) <= attackReachThreshold,
      Math.max(TEST_TIMEOUT_MS, 30000),
      'reach attack target'
    );
    state = await assertAliveBefore(page, 'attack target selection', state);
    await page.evaluate(
      (/** @type {any} */ mobId) => window.__game?.selectTarget?.({ kind: 'mob', id: mobId }),
      attackTarget.id
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player?.targetId === attackTarget.id,
      TEST_TIMEOUT_MS,
      'target selection'
    );

    await page.waitForFunction(() =>
      document.querySelector('#target-hud')?.classList.contains('visible')
    );
    const targetState = state.target;
    if (!targetState || targetState.id !== attackTarget.id) {
      throw new Error('Target HUD state not available after selection');
    }
    const targetHudName = await page.locator('#target-name').innerText();
    if (targetHudName.trim() !== targetState.name) {
      throw new Error(
        `Target HUD name mismatch. Expected "${targetState.name}", got "${targetHudName}"`
      );
    }
    const targetHudMeta = await page.locator('#target-meta').innerText();
    if (!targetHudMeta.includes(`Lvl ${targetState.level}`)) {
      throw new Error(`Target HUD missing level: "${targetHudMeta}"`);
    }
    const targetHudHp = await page.locator('#target-hp-value').innerText();
    if (!targetHudHp.includes('/')) {
      throw new Error(`Target HUD HP missing: "${targetHudHp}"`);
    }

    const xpBarBefore = await page.getAttribute('#xp-bar', 'aria-valuenow');
    const xpTextBefore = await page.locator('#xp-bar-value').innerText();
    const xpBefore = state.player?.xp ?? 0;
    const levelBeforeBar = state.player?.level ?? 1;

    let updatedTarget = state.mobs.find((/** @type {any} */ m) => m.id === attackTarget.id);
    if (!updatedTarget) {
      throw new Error('Attack target missing from state');
    }
    let attackProgressSeen = false;
    let stalledCombatIterations = 0;
    const attackDeadline = Date.now() + Math.max(TEST_TIMEOUT_MS, 40000);
    while (Date.now() < attackDeadline) {
      state = await assertAliveBefore(page, 'kill-target combat loop', state);
      const hpBeforeAttack = updatedTarget.hp ?? 0;
      const cooldownBeforeAttack = state.player?.attackCooldownUntil ?? 0;
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        if (window.__game?.forceAbility) {
          window.__game.forceAbility(1);
          return;
        }
        window.__game?.useAbility?.(1);
      });
      try {
        state = await waitForCondition(
          page,
          (/** @type {any} */ s) => {
            const mob = s.mobs?.find((/** @type {any} */ m) => m.id === attackTarget.id);
            if (!mob) return false;
            const cooldownAfter = s.player?.attackCooldownUntil ?? 0;
            return mob.dead || mob.hp <= 0 || mob.hp < hpBeforeAttack || cooldownAfter > cooldownBeforeAttack;
          },
          4500,
          `combat progress against ${attackTarget.id}`
        );
      } catch (err) {
        state = await getState(page);
      }
      updatedTarget = state.mobs.find((/** @type {any} */ m) => m.id === attackTarget.id);
      if (!updatedTarget) break;
      const hpAfterAttack = updatedTarget.hp ?? 0;
      const cooldownAfterAttack = state.player?.attackCooldownUntil ?? 0;
      const progressed =
        updatedTarget.dead ||
        hpAfterAttack <= 0 ||
        hpAfterAttack < hpBeforeAttack ||
        cooldownAfterAttack > cooldownBeforeAttack;
      if (progressed) {
        attackProgressSeen = true;
        stalledCombatIterations = 0;
      } else {
        stalledCombatIterations += 1;
      }
      if (updatedTarget.dead || updatedTarget.hp <= 0) break;
      if (stalledCombatIterations >= 3) {
        await page.evaluate(
          (/** @type {any} */ mobId) => window.__game?.selectTarget?.({ kind: 'mob', id: mobId }),
          attackTarget.id
        );
        await page.evaluate(
          (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
          attackMoveTarget
        );
        state = await waitForCondition(
          page,
          (/** @type {any} */ s) => {
            const mob = s.mobs?.find((/** @type {any} */ m) => m.id === attackTarget.id && !m.dead);
            if (!mob || !s.player) return false;
            return s.player.targetId === attackTarget.id && distance(s.player, mob) <= attackReachThreshold;
          },
          5000,
          `recover attack range (${attackTarget.id})`
        ).catch(async () => getState(page));
        updatedTarget = state.mobs.find((/** @type {any} */ m) => m.id === attackTarget.id) ?? updatedTarget;
        stalledCombatIterations = 0;
      }
    }
    if (!updatedTarget) {
      throw new Error('Attack target missing from state');
    }
    if (!updatedTarget.dead) {
      throw new Error(
        `Expected attack target to die from basic attacks (hp=${updatedTarget.hp ?? 'n/a'}, attackCooldownUntil=${state.player?.attackCooldownUntil ?? 'n/a'}, progress=${attackProgressSeen})`
      );
    }

    const xpAfter = state.player?.xp ?? 0;
    const xpBarAfter = await page.getAttribute('#xp-bar', 'aria-valuenow');
    const xpTextAfter = await page.locator('#xp-bar-value').innerText();
    const parsedBarAfter = Number.parseInt(xpBarAfter ?? '', 10);
    if (
      xpAfter === xpBefore &&
      xpBarAfter === xpBarBefore &&
      xpTextAfter === xpTextBefore &&
      (state.player?.level ?? 1) === levelBeforeBar
    ) {
      throw new Error('XP bar did not update after mob kill');
    }
    if (Number.isFinite(parsedBarAfter) && parsedBarAfter !== xpAfter) {
      throw new Error(
        `XP bar mismatch. Expected ${xpAfter}, got ${parsedBarAfter}`
      );
    }

    const liveMobs = state.mobs.filter((/** @type {any} */ m) => !m.dead);
    const knownPassiveMobIds = new Set(['m1', 'm2', 'm3', 'm4']);
    const combatMobs = liveMobs.filter(
      (/** @type {any} */ m) =>
        String(m.id ?? '').startsWith('m') &&
        !knownPassiveMobIds.has(String(m.id ?? ''))
    );
    const obstaclesForMobs = state.world?.collisionObstacles ?? state.world?.obstacles ?? [];
    const losMobs = combatMobs.filter((/** @type {any} */ m) => hasLineOfSight(state.player, m, obstaclesForMobs));
    const damagePool = (losMobs.length ? losMobs : combatMobs).filter(
      (/** @type {any} */ m) => m.id !== attackTarget.id
    );
    const mobDamageTarget =
      damagePool.find((/** @type {any} */ mob) => mob.id === 'm-chase') ??
      damagePool.reduce((/** @type {any} */ closest, /** @type {any} */ current) => {
        if (!closest) return current;
        return distance(state.player, current) < distance(state.player, closest)
          ? current
          : closest;
      }, null) ?? liveMobs[0];
    if (!mobDamageTarget) {
      throw new Error('No mob available for damage test');
    }
    state = await assertAliveBefore(page, 'explicit damage/death phase', state);
    const mobDamageTargetId = mobDamageTarget.id;
    const hpBefore = state.player.hp;
    const damageTimeoutMs = Math.max(TEST_TIMEOUT_MS, 30000);
    const mobAttackRange = 1.4;

    await page.evaluate(
      (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
      { x: mobDamageTarget.x, z: mobDamageTarget.z }
    );

    await waitForCondition(
      page,
      (/** @type {any} */ s) => {
        const mob = s.mobs?.find((/** @type {any} */ m) => m.id === mobDamageTargetId && !m.dead);
        return mob && s.player && distance(s.player, mob) <= mobAttackRange - 0.1;
      },
      Math.max(TEST_TIMEOUT_MS, 30000),
      'reach mob for damage'
    );

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.player.hp < hpBefore,
      damageTimeoutMs,
      'mob damage'
    );

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.player.dead,
      DEATH_TIMEOUT_MS,
      'player death'
    );

    await page.waitForSelector('#death-screen.open', { timeout: 5000 });
    state = await getState(page);
    const respawnText = await page.locator('#death-timer').innerText();
    const [mins, secs] = respawnText.split(':').map((/** @type {any} */ s) => Number.parseInt(s, 10));
    const respawnSeconds = Number.isFinite(mins) && Number.isFinite(secs)
      ? mins * 60 + secs
      : NaN;
    if (!Number.isFinite(respawnSeconds)) {
      throw new Error(`Respawn timer not parseable: "${respawnText}"`);
    }
    const serverTime = Number(state.serverTime ?? state.t ?? Date.now());
    const respawnAt = Number(state.player?.respawnAt ?? 0);
    const expectedRespawn = Math.ceil(
      Math.max(0, (respawnAt - serverTime) / 1000)
    );
    if (respawnAt > 0 && Math.abs(respawnSeconds - expectedRespawn) > 1) {
      throw new Error(
        `Respawn HUD mismatch. Expected ~${expectedRespawn}s, got ${respawnSeconds}s`
      );
    }

    stage = 'repair-and-salvage';
    await safeClick(page, '#death-respawn-btn');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && !s.player.dead && (s.player.hp ?? 0) > 0,
      TEST_TIMEOUT_MS,
      'respawn after death'
    );
    await page.waitForFunction(
      () => !document.querySelector('#death-screen')?.classList.contains('open')
    );

    await page.evaluate(
      (/** @type {any} */ point) => window.__game?.moveTo(point.x, point.z),
      vendor
    );
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        s.player &&
        distance(s.player, vendor) <= (s.world?.vendorInteractRadius ?? 2.5) - 0.05,
      TEST_TIMEOUT_MS,
      'return to vendor for repair'
    );
    const equippedWeaponBeforeRepair = state.player?.equipment?.weapon ?? null;
    if (!equippedWeaponBeforeRepair || equippedWeaponBeforeRepair.kind !== 'weapon_iron_blade') {
      throw new Error('Crafted iron blade was not equipped after respawn');
    }
    const weaponMaxDurabilityBeforeRepair = Number(equippedWeaponBeforeRepair.maxDurability ?? 0);
    const weaponDurabilityBeforeRepair = Number(equippedWeaponBeforeRepair.durability ?? 0);
    if (!(weaponMaxDurabilityBeforeRepair > 0) || !(weaponDurabilityBeforeRepair < weaponMaxDurabilityBeforeRepair)) {
      throw new Error('Crafted weapon did not lose durability before repair check');
    }

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory open for maintenance'
    );
    await safeClick(page, '.inventory-tab[data-tab="journal"]');
    await page.waitForFunction(() =>
      document.getElementById('journal-view')?.classList.contains('active')
    );
    await page.waitForFunction(() => {
      const root = document.getElementById('journal-root');
      const text = root?.textContent ?? '';
      return text.includes('Maintenance') && text.includes('Repair');
    });

    const copperBeforeRepair = state.player?.currencyCopper ?? 0;
    await page.evaluate(() => window.__game?.repairItem?.('equipment', 'weapon'));
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => {
        const weapon = s.player?.equipment?.weapon;
        return (
          weapon?.kind === 'weapon_iron_blade' &&
          Number(weapon.durability ?? 0) >= Number(weapon.maxDurability ?? 0) &&
          (s.player?.currencyCopper ?? 0) < copperBeforeRepair
        );
      },
      TEST_TIMEOUT_MS,
      'repair crafted weapon'
    );

    if (consoleErrors.length) {
      throw new Error(`Console errors: ${consoleErrors.join('\n')}`);
    }
  } catch (err) {
    await writeFailureArtifacts({ page, stage, error: err });
    throw err;
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

async function runWithRetries(/** @type {any} */ maxAttempts = E2E_ATTEMPTS) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await run();
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        console.log(`E2E attempt ${attempt} failed, retrying...`);
      }
    }
  }
  throw lastErr;
}

runWithRetries(E2E_ATTEMPTS).catch((/** @type {any} */ err) => {
  console.error(err);
  process.exit(1);
});
