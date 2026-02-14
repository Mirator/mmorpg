/**
 * Verifies the player unit frame overlay layout.
 * Run with: node scripts/verify-overlay.js
 * Requires: server running on E2E_PORT (default 3001), DATABASE_URL_E2E set
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 3001;
const BASE_URL = `http://localhost:${PORT}`;
const DATABASE_URL_E2E = process.env.DATABASE_URL_E2E;
const SCREENSHOT_PATH = path.join(__dirname, '..', 'e2e-overlay-verify.png');

function resetE2eDatabase() {
  if (!DATABASE_URL_E2E) {
    throw new Error('DATABASE_URL_E2E is not set');
  }
  const result = spawnSync('npm', ['run', 'db:reset:e2e'], {
    stdio: 'inherit',
    env: process.env,
    cwd: path.join(__dirname, '..'),
  });
  if (result.status !== 0) throw new Error('Failed to reset e2e database');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(proc) {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    try {
      const res = await fetch(`${BASE_URL}/`);
      if (res.ok) return;
    } catch (_) {}
    await sleep(200);
  }
  throw new Error('Server did not start');
}

async function main() {
  resetE2eDatabase();
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', E2E_TEST: 'true', DATABASE_URL: DATABASE_URL_E2E },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });

  try {
    await waitForServer(server);
    const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      if (!localStorage.getItem('e2e_clear_done')) {
        localStorage.clear();
        localStorage.setItem('e2e_clear_done', 'true');
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const suffix = Date.now().toString(36);
    const username = `tester_${suffix}`;
    const password = 'password123';
    const characterName = `Hero ${suffix}`;

    await page.waitForSelector('#menu.open');
    await page.click('.menu-tab[data-tab="signup"]');
    await page.waitForFunction(() => !document.querySelector('#signup-form')?.classList.contains('hidden'));
    await page.fill('#signup-username', username);
    await page.fill('#signup-password', password);
    await page.click('#signup-form button[type="submit"]');

    await page.waitForFunction(
      () => document.querySelector('#menu')?.dataset?.step === 'characters',
      { timeout: 10000 }
    );
    await page.click('#character-create-open');
    await page.waitForSelector('#menu[data-step="create"]');
    await page.fill('#character-name', characterName);
    await page.selectOption('#character-class', 'mage');
    await page.click('#character-create-form button[type="submit"]');

    await page.waitForFunction(
      () => document.querySelector('#loading-screen')?.classList.contains('visible') === true,
      { timeout: 5000 }
    );
    await page.waitForFunction(
      () => !document.querySelector('#loading-screen')?.classList.contains('visible'),
      { timeout: 30000 }
    );

    await page.waitForSelector('#overlay', { timeout: 10000 });
    await page.waitForTimeout(500);

    const metrics = await page.evaluate(() => {
      const portrait = document.querySelector('.player-frame-portrait');
      const info = document.querySelector('.player-frame-info');
      if (!portrait || !info) return { portrait: null, info: null, ok: false };
      const pr = portrait.getBoundingClientRect();
      const ir = info.getBoundingClientRect();
      const heightDiff = Math.abs(pr.height - ir.height);
      return {
        portrait: { height: pr.height, width: pr.width },
        info: { height: ir.height, width: ir.width },
        heightDiff,
        ok: heightDiff <= 2,
      };
    });

    await page.locator('#overlay').screenshot({ path: SCREENSHOT_PATH });

    console.log('Overlay metrics:', JSON.stringify(metrics, null, 2));
    console.log('Screenshot saved to:', SCREENSHOT_PATH);

    if (!metrics.ok) {
      console.error('FAIL: Portrait and info panel heights do not match. Diff:', metrics.heightDiff);
      process.exit(1);
    }
    console.log('PASS: Portrait and info panel have same height');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
