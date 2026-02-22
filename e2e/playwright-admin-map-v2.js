// @ts-check
// @ts-nocheck

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, PORT, sleep, waitForServer } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARD_TIMEOUT_MS = 180_000;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function dispatchTemplateDrop(page, templateId, targetPosition) {
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

async function unlockPage(page) {
  await page.fill('#admin-pass', '1234');
  await page.click('#auth-form button[type="submit"]');
  await page.waitForSelector('#status.ok', { timeout: 15_000 });
}

async function waitForRestoredSession(page) {
  await page.waitForSelector('#status.ok', { timeout: 15_000 });
  const passwordValue = await page.locator('#admin-pass').inputValue();
  ensure(passwordValue === '', 'Admin password field should stay empty after session restore.');
}

async function setAlias(page, alias) {
  await page.evaluate((nextAlias) => {
    localStorage.setItem('ra.admin.alias', nextAlias);
  }, alias);
}

async function run() {
  let stage = 'init';
  const hardTimeout = setTimeout(() => {
    console.error(`[admin-e2e] timed out after ${HARD_TIMEOUT_MS}ms (stage=${stage})`);
    process.exit(1);
  }, HARD_TIMEOUT_MS);

  const sourceMapPath = path.resolve(__dirname, '../server/data/world-map.json');
  const sourceDesignerPath = path.resolve(__dirname, '../server/data/world-map.designer.json');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-map-v2-phase2-'));
  const tempMapPath = path.join(tmpDir, 'world-map.json');
  const tempDesignerPath = path.join(tmpDir, 'world-map.designer.json');
  fs.copyFileSync(sourceMapPath, tempMapPath);
  fs.copyFileSync(sourceDesignerPath, tempDesignerPath);

  const server = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      E2E_TEST: 'true',
      ADMIN_PASSWORD: '1234',
      MAP_CONFIG_PATH: tempMapPath,
      MAP_DESIGNER_STATE_PATH: tempDesignerPath,
      AUTO_MIGRATE_DEV: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser = null;

  try {
    stage = 'wait-server';
    await waitForServer(server);

    stage = 'launch-browser';
    browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });

    const context = await browser.newContext({ viewport: { width: 1500, height: 960 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);

    page.on('dialog', async (dialog) => {
      await dialog.accept('e2e-admin');
    });
    page.on('pageerror', (err) => {
      console.error('[admin-e2e][pageerror]', err.message);
    });

    stage = 'dashboard';
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    await setAlias(page, 'e2e-admin');
    await unlockPage(page);
    await page.waitForSelector('#zone-body tr');

    stage = 'assets-prefab-crud';
    await page.goto(`${BASE_URL}/admin/assets`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);

    await page.fill('#create-name', 'E2E Market Prefab');
    await page.fill('#create-type', 'structures');
    await page.fill('#create-path', '/assets/e2e-market.glb');
    await page.fill('#create-tags', 'e2e,market');
    await page.fill('#create-defaults', '{"kind":"market","colliderRadius":4}');
    await page.click('#create-prefab-form button[type="submit"]');
    await page.waitForFunction(() => {
      const rows = [...document.querySelectorAll('#prefab-list .list-item')];
      return rows.some((row) => row.textContent?.includes('E2E Market Prefab'));
    });

    const prefabId = await page.evaluate(() => {
      const listItems = [...document.querySelectorAll('#prefab-list .list-item')];
      const target = listItems.find((row) => row.textContent?.includes('E2E Market Prefab'));
      if (!target) return null;
      const idEl = target.querySelector('.mono');
      return idEl?.textContent?.trim() ?? null;
    });
    ensure(typeof prefabId === 'string' && prefabId.length > 0, 'Failed to create prefab in assets manager.');

    stage = 'map-basic-flow';
    await page.goto(`${BASE_URL}/admin/map`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);
    await page.waitForFunction(() => Boolean(window.__MAP_EDITOR_V2__?.getState()?.mapConfig));

    const before = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    const startStructureCount = before.mapConfig.structures.length;

    await page.fill('#asset-search', 'prefab');
    await dispatchTemplateDrop(page, `prefab:${prefabId}`, { x: 320, y: 260 });
    await sleep(120);

    const afterDrop = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    ensure(afterDrop.mapConfig.structures.length === startStructureCount + 1, 'Prefab template drop did not add structure.');

    const dropped = afterDrop.mapConfig.structures[afterDrop.mapConfig.structures.length - 1];

    const canvasBox = await page.locator('#map-canvas').boundingBox();
    ensure(canvasBox, 'Canvas bounding box unavailable.');

    const dragStart = {
      x: canvasBox.x + 320,
      y: canvasBox.y + 260,
    };
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 80, dragStart.y + 30, { steps: 10 });
    await page.mouse.up();

    const afterMove = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    const moved = afterMove.mapConfig.structures[afterMove.mapConfig.structures.length - 1];
    ensure(moved.x !== dropped.x || moved.z !== dropped.z, 'Move drag did not update structure position.');

    await page.click('#undo-btn');
    const afterUndo = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    const undoPos = afterUndo.mapConfig.structures[afterUndo.mapConfig.structures.length - 1];
    ensure(undoPos.x === dropped.x && undoPos.z === dropped.z, 'Undo failed for structure move.');

    await page.click('#redo-btn');
    const afterRedo = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    const redoPos = afterRedo.mapConfig.structures[afterRedo.mapConfig.structures.length - 1];
    ensure(redoPos.x === moved.x && redoPos.z === moved.z, 'Redo failed for structure move.');

    stage = 'mode-edits';

    await page.click('button[data-mode="Nav"]');
    await page.click('button[data-tool="paint"]');
    await page.mouse.click(canvasBox.x + 360, canvasBox.y + 300);
    await sleep(100);

    await page.click('button[data-mode="Trigger"]');
    await page.click('button[data-tool="paint"]');
    await page.mouse.click(canvasBox.x + 420, canvasBox.y + 320);
    await sleep(100);

    await page.click('button[data-mode="Path"]');
    await page.click('button[data-tool="paint"]');
    await page.mouse.click(canvasBox.x + 440, canvasBox.y + 280);
    await page.mouse.click(canvasBox.x + 500, canvasBox.y + 300);
    await sleep(100);

    await page.click('button[data-mode="Lighting"]');
    await page.click('button[data-tool="paint"]');
    await page.mouse.click(canvasBox.x + 390, canvasBox.y + 230);
    await sleep(100);

    let afterModeEdits = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    if (afterModeEdits.zoneState.paths.length < 1) {
      await page.click('button[data-mode="Path"]');
      await page.click('button[data-tool="paint"]');
      await page.mouse.click(canvasBox.x + 470, canvasBox.y + 260);
      await page.mouse.click(canvasBox.x + 520, canvasBox.y + 310);
      await sleep(160);
      afterModeEdits = await page.evaluate(() => window.__MAP_EDITOR_V2__.getState());
    }
    ensure(afterModeEdits.zoneState.navAreas.length >= 1, 'Nav mode did not add nav areas.');
    ensure(afterModeEdits.zoneState.triggers.length >= 1, 'Trigger mode did not add trigger regions.');
    ensure(afterModeEdits.zoneState.paths.length >= 1, 'Path mode did not add path graph.');
    ensure(afterModeEdits.zoneState.lightingRegions.length >= 1, 'Lighting mode did not add lighting regions.');

    stage = 'map-save-reload';
    await page.click('#save-btn');
    await page.waitForSelector('#save-status.ok');
    await page.click('#reload-btn');
    await page.waitForFunction(() => {
      const text = document.querySelector('#save-status')?.textContent || '';
      return text.includes('Reloaded map and designer state.');
    });

    stage = 'lock-conflict';
    await page.click('[data-layer-id="navmesh"][data-layer-action="acquire-lock"]');
    await page.waitForFunction(() => {
      const state = window.__MAP_EDITOR_V2__?.getState();
      return Boolean(state?.zoneState?.locks?.layers?.navmesh);
    });

    await setAlias(page, 'other-admin');
    await page.goto(`${BASE_URL}/admin/nav`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);

    const navCountBefore = Number(await page.locator('#nav-count').innerText());
    const navCanvasBox = await page.locator('#nav-canvas').boundingBox();
    ensure(navCanvasBox, 'Nav canvas not available.');
    await page.mouse.click(navCanvasBox.x + 280, navCanvasBox.y + 180);
    await sleep(220);

    const navCountAfter = Number(await page.locator('#nav-count').innerText());
    ensure(navCountAfter === navCountBefore, 'Layer lock conflict did not block nav edit for other alias.');

    stage = 'patch-lifecycle';
    await setAlias(page, 'e2e-admin');
    await page.goto(`${BASE_URL}/admin/patches`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);

    const patchTitle = `E2E Patch ${Date.now()}`;
    await page.fill('#create-title', patchTitle);
    await page.fill('#create-description', 'Phase2 lifecycle test');
    await page.click('#create-patch-form button[type="submit"]');
    await page.waitForSelector('#status.ok');
    await page.click(`#patch-list .list-item:has-text("${patchTitle}")`);
    await page.waitForFunction(
      (title) => document.querySelector('#detail-title')?.textContent?.includes(title),
      patchTitle
    );
    await page.click('#request-approval-btn');
    await page.waitForFunction(() => document.querySelector('#detail-status')?.textContent?.includes('Review Requested'));

    await page.click('#approve-btn');
    await page.waitForFunction(() => document.querySelector('#detail-status')?.textContent?.includes('Approved'));

    await page.click('#publish-btn');
    await page.waitForFunction(() => document.querySelector('#detail-status')?.textContent?.includes('Published'));
    await page.waitForSelector('#restart-note:not([hidden])');

    await page.click('#rollback-btn');
    await page.waitForFunction(() => document.querySelector('#detail-status')?.textContent?.includes('Rolled Back'));

    stage = 'collab-comments-audit';
    await page.goto(`${BASE_URL}/admin/collab`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);

    await page.fill('#comment-x', '12');
    await page.fill('#comment-y', '0');
    await page.fill('#comment-z', '-8');
    await page.fill('#comment-text', 'E2E comment pin');
    await page.click('#comment-form button[type="submit"]');
    await page.waitForSelector('#status.ok');

    await page.click('#comment-list button[data-action="resolve"]');
    await sleep(120);

    const auditContainsComment = await page.evaluate(() => {
      const entries = [...document.querySelectorAll('#audit-list .list-item')].map((row) => row.textContent || '');
      return entries.some((text) => text.includes('comment'));
    });
    ensure(auditContainsComment, 'Audit timeline did not include comment actions.');

    stage = 'playtest-preview';
    await page.goto(`${BASE_URL}/admin/playtest`, { waitUntil: 'domcontentloaded' });
    await waitForRestoredSession(page);

    await page.click('#launch-preview-btn');
    await page.waitForSelector('#status.ok');

    const frameSrc = await page.locator('#preview-frame').getAttribute('src');
    ensure(typeof frameSrc === 'string' && frameSrc.includes('?guest=1'), 'Playtest iframe did not launch guest preview.');

    const telemetryRendered = await page.evaluate(() => {
      const players = document.querySelector('#telemetry-player-count')?.textContent?.trim() || '';
      const mobs = document.querySelector('#telemetry-mob-count')?.textContent?.trim() || '';
      return players.length > 0 && mobs.length > 0;
    });
    ensure(telemetryRendered, 'Playtest telemetry panel did not render values.');

    stage = 'lock-session';
    await page.click('#lock-btn');
    await page.waitForFunction(() => {
      const text = document.querySelector('#status')?.textContent || '';
      return text.toLowerCase().includes('locked');
    });

    await page.goto(`${BASE_URL}/admin/assets`, { waitUntil: 'domcontentloaded' });
    await sleep(250);
    const lockedText = await page.locator('#status').innerText();
    ensure(lockedText.toLowerCase().includes('locked'), 'Admin lock button did not invalidate session.');

    stage = 'complete';
    await context.close();
  } finally {
    clearTimeout(hardTimeout);
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
    await sleep(200);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
