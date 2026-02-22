// @ts-check
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE_URL,
  DATABASE_URL_E2E,
  DEATH_TIMEOUT_MS,
  PORT,
  TEST_TIMEOUT_MS,
  advance,
  distance,
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

function isClickableInViewport(/** @type {any} */ rect, /** @type {any} */ viewport) {
  if (!rect || !viewport) return false;
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.left < 0 || rect.top < 0) return false;
  if (rect.right > viewport.width || rect.bottom > viewport.height) return false;
  return true;
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

async function run() {
  resetE2eDatabase();
  const server = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
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
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');
    const username = 'e2e_tester';
    const password = 'e2e_password';
    const characterName = `Hero ${Date.now().toString(36)}`;

    await page.waitForSelector('#menu.open');
    await page.click('.menu-tab[data-tab=\"signin\"]');
    await page.waitForFunction(
      () => !document.querySelector('#signin-form')?.classList.contains('hidden')
    );
    await page.fill('#signin-username', username);
    await page.fill('#signin-password', password);
    await page.click('#signin-form button[type=\"submit\"]');

    const signInResult = await waitForMenuStepOrError(page, 'characters', TEST_TIMEOUT_MS);
    if (!signInResult.ok) {
      throw new Error(`Sign-in failed: ${signInResult.errorText ?? 'unknown error'}`);
    }
    await page.click('#character-create-open');
    await page.waitForSelector('#menu[data-step=\"create\"]');
    await page.fill('#character-name', characterName);
    await page.selectOption('#character-class', 'fighter');
    await page.click('#character-create-form button[type=\"submit\"]');

    await page.waitForFunction(
      () => document.querySelector('#loading-screen')?.classList.contains('visible') === true,
      { timeout: 5000 }
    );
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
    await page.hover('#overlay');
    await page.waitForTimeout(200);
    const overlayHoverMatch = await page.evaluate(() => {
      const el = document.querySelector('#overlay');
      return el ? el.matches(':hover') : false;
    });
    if (!overlayHoverMatch) {
      await page.dispatchEvent('#overlay', 'mouseenter');
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => {
      const el = document.querySelector('#overlay');
      if (el && !el.classList.contains('hovered')) {
        el.classList.add('hovered');
      }
    });
    await page.waitForTimeout(100);
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

    let state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.resources?.length > 0 && s.mobs?.length > 0,
      TEST_TIMEOUT_MS,
      'initial state'
    );
    console.log(`Initial resources: ${state.resources.length}, mobs: ${state.mobs.length}`);

    const /** @type {any} */ startPos = { x: state.player.x, z: state.player.z };
    await page.keyboard.down('w');
    await sleep(300);
    await advance(page, 700);
    await page.keyboard.up('w');

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, startPos) > 0.5,
      TEST_TIMEOUT_MS,
      'movement'
    );
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

    const invBefore = state.player.inv;
    await page.evaluate(() => window.__game?.interact());
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && s.player.inv === invBefore + 1,
      TEST_TIMEOUT_MS,
      'harvest'
    );

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
    await page.keyboard.press('c');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.skills?.open,
      TEST_TIMEOUT_MS,
      'character panel open'
    );
    await page.waitForSelector('#character-view.active');

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

    const fromBox = await page
      .locator(`.inventory-slot[data-index="${fromSlot}"]`)
      .boundingBox();
    const toBox = await page
      .locator(`.inventory-slot[data-index="${toSlot}"]`)
      .boundingBox();
    if (!fromBox || !toBox) {
      throw new Error('Inventory slots not found for drag test');
    }

    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, {
      steps: 6,
    });
    await page.mouse.up();

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

    await weaponSlotLoc.dragTo(emptySlotEl);
    await page.waitForTimeout(500);

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.inventory?.items?.some((/** @type {any} */ item) => item.kind?.startsWith('weapon_')),
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
    await weaponItemSlotEl.dragTo(weaponSlotLoc);

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

    stage = 'vendor-trade-desktop';
    const vendor = state.world?.vendors?.[0];
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
    await page.click('#vendor-trade-btn');
    await page.waitForSelector('#vendor-panel.open');
    await assertVendorControlsInViewport(page, 'desktop vendor layout');

    await page.click('.vendor-tab[data-tab=\"sell\"]');
    await page.waitForFunction(() => {
      const sell = document.querySelector('.vendor-sell');
      return sell?.classList.contains('active');
    });

    state = await getState(page);
    const sellItems = Array.isArray(state.inventory?.items) ? state.inventory.items : [];
    if (sellItems.length === 0) {
      throw new Error('No inventory items available to sell');
    }
    const sellSlot = sellItems[0].slot;
    const sellCount = sellItems[0].count ?? 1;
    const currencyBefore = state.player?.currencyCopper ?? 0;

    const sellBox = await page
      .locator(`.inventory-slot[data-index=\"${sellSlot}\"]`)
      .boundingBox();
    const dropBox = await page.locator('.vendor-dropzone').boundingBox();
    if (!sellBox || !dropBox) {
      throw new Error('Vendor dropzone or inventory slot not found');
    }

    await page.mouse.move(sellBox.x + sellBox.width / 2, sellBox.y + sellBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, {
      steps: 6,
    });
    await page.mouse.up();

    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        (s.player?.currencyCopper ?? 0) > currencyBefore &&
        !s.inventory?.items?.some((/** @type {any} */ item) => item.slot === sellSlot),
      TEST_TIMEOUT_MS,
      'vendor sell'
    );
    const currencyAfter = state.player?.currencyCopper ?? 0;
    const expectedIncrease = sellCount * 10;
    if (currencyAfter - currencyBefore !== expectedIncrease) {
      throw new Error(
        `Currency mismatch. Expected +${expectedIncrease}, got +${currencyAfter - currencyBefore}`
      );
    }

    await page.click('#vendor-panel-close');
    await page.waitForFunction(
      () =>
        !document.querySelector('#vendor-panel')?.classList.contains('open') &&
        !document.querySelector('#inventory-panel')?.classList.contains('open') &&
        !document.body.classList.contains('trade-open')
    );
    await page.waitForTimeout(300);

    stage = 'vendor-trade-small-viewport';
    await page.setViewportSize(SMALL_VIEWPORT);
    await page.waitForTimeout(120);
    await page.keyboard.press('e');
    await page.waitForSelector('#vendor-dialog.open');
    await page.click('#vendor-trade-btn');
    await page.waitForSelector('#vendor-panel.open');
    await assertVendorControlsInViewport(page, 'small viewport vendor layout');
    await page.click('.vendor-tab[data-tab=\"buy\"]');
    await page.waitForFunction(() => {
      const buy = document.querySelector('.vendor-buy');
      return buy?.classList.contains('active');
    });
    await page.click('.vendor-tab[data-tab=\"sell\"]');
    await page.waitForFunction(() => {
      const sell = document.querySelector('.vendor-sell');
      return sell?.classList.contains('active');
    });
    await page.click('#vendor-panel-close');
    await page.waitForFunction(
      () =>
        !document.querySelector('#vendor-panel')?.classList.contains('open') &&
        !document.body.classList.contains('trade-open')
    );
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.waitForTimeout(120);

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

    await page.keyboard.press('Tab');
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

    await page.keyboard.press('1');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) =>
        Array.isArray(s.combat?.recentEvents) &&
        s.combat.recentEvents.some((/** @type {any} */ event) => event.kind === 'basic_attack'),
      TEST_TIMEOUT_MS,
      'combat event'
    );
    await sleep(950);
    await advance(page, 200);

    let updatedTarget = state.mobs.find((/** @type {any} */ m) => m.id === attackTarget.id);
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('1');
      await sleep(950);
      await advance(page, 200);
      state = await getState(page);
      updatedTarget = state.mobs.find((/** @type {any} */ m) => m.id === attackTarget.id);
      if (!updatedTarget) break;
      if (updatedTarget.dead || updatedTarget.hp <= 0) break;
    }
    if (!updatedTarget) {
      throw new Error('Attack target missing from state');
    }
    if (!updatedTarget.dead) {
      throw new Error('Expected attack target to die from basic attacks');
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
    const respawnText = await page.locator('#death-timer').innerText();
    const [mins, secs] = respawnText.split(':').map((/** @type {any} */ s) => Number.parseInt(s, 10));
    const respawnSeconds = Number.isFinite(mins) && Number.isFinite(secs)
      ? mins * 60 + secs
      : NaN;
    if (!Number.isFinite(respawnSeconds)) {
      throw new Error(`Respawn timer not parseable: "${respawnText}"`);
    }
    const serverTime = state.serverTime ?? state.t ?? Date.now();
    const expectedRespawn = Math.ceil(
      Math.max(0, (state.player.respawnAt - serverTime) / 1000)
    );
    if (Math.abs(respawnSeconds - expectedRespawn) > 1) {
      throw new Error(
        `Respawn HUD mismatch. Expected ~${expectedRespawn}s, got ${respawnSeconds}s`
      );
    }

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

async function runWithRetries(/** @type {any} */ maxAttempts = 2) {
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

runWithRetries().catch((/** @type {any} */ err) => {
  console.error(err);
  process.exit(1);
});
