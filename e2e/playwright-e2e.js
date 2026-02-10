import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 3001;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 20000;
const DEATH_TIMEOUT_MS = 30000;
const DATABASE_URL_E2E = process.env.DATABASE_URL_E2E;

function resetE2eDatabase() {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeout,
  ]);
}

async function waitForServer(proc) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const onData = (data) => {
        const text = data.toString();
        if (text.includes('Server running')) {
          cleanup();
          resolve();
        }
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onExit = (code) => {
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

async function getState(page) {
  const text = await page.evaluate(() => {
    if (typeof window.render_game_to_text === 'function') {
      return window.render_game_to_text();
    }
    return null;
  });
  if (!text) throw new Error('render_game_to_text unavailable');
  return JSON.parse(text);
}

async function advance(page, ms) {
  await page.evaluate((delta) => {
    if (typeof window.advanceTime === 'function') {
      return window.advanceTime(delta);
    }
    return null;
  }, ms);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

function segmentDistanceToPoint(a, b, p) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const apx = p.x - a.x;
  const apz = p.z - a.z;
  const abLen2 = abx * abx + abz * abz;
  if (abLen2 === 0) return Math.hypot(apx, apz);
  let t = (apx * abx + apz * abz) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + abx * t, z: a.z + abz * t };
  return distance(closest, p);
}

function hasLineOfSight(from, to, obstacles, buffer = 0.8) {
  if (!Array.isArray(obstacles)) return true;
  for (const obs of obstacles) {
    const dist = segmentDistanceToPoint(from, to, obs);
    if (dist < obs.r + buffer) return false;
  }
  return true;
}

async function waitForCondition(page, condition, timeoutMs, label) {
  const start = Date.now();
  let lastState = null;
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

  try {
    await waitForServer(server);

    const browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      if (!localStorage.getItem('e2e_clear_done')) {
        localStorage.clear();
        localStorage.setItem('e2e_clear_done', 'true');
      }
    });

    const consoleErrors = [];
    const ignoredErrorSnippets = [
      'WebGLRenderer: A WebGL context could not be created',
      'WebGLRenderer: Error creating WebGL context',
      'WebGL unavailable, falling back to canvas renderer.',
    ];
    const shouldIgnoreError = (text) =>
      ignoredErrorSnippets.some((snippet) => text.includes(snippet));

    page.on('pageerror', (err) => {
      const text = String(err);
      if (!shouldIgnoreError(text)) {
        consoleErrors.push(text);
      }
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!shouldIgnoreError(text)) {
        consoleErrors.push(text);
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');
    const suffix = Date.now().toString(36);
    const username = `tester_${suffix}`;
    const password = 'password123';
    const characterName = `Hero ${suffix}`;

    await page.waitForSelector('#menu.open');
    await page.click('.menu-tab[data-tab=\"signup\"]');
    await page.fill('#signup-username', username);
    await page.fill('#signup-password', password);
    await page.click('#signup-form button[type=\"submit\"]');

    await page.waitForSelector('#menu[data-step=\"characters\"]');
    await page.click('#character-create-open');
    await page.waitForSelector('#menu[data-step=\"create\"]');
    await page.fill('#character-name', characterName);
    await page.selectOption('#character-class', 'fighter');
    await page.click('#character-create-form button[type=\"submit\"]');

    await page.waitForFunction(
      () => !document.querySelector('#menu')?.classList.contains('open')
    );

    await page.waitForSelector('#ability-bar .ability-slot');
    const abilitySlotCount = await page.locator('#ability-bar .ability-slot').count();
    if (abilitySlotCount !== 10) {
      throw new Error(`Ability bar slot count mismatch: ${abilitySlotCount}`);
    }

    await page.keyboard.press('k');
    await page.waitForSelector('#skills-panel.open');
    await page.waitForFunction(() =>
      document.querySelector('#skills-list')?.textContent?.includes('Slash')
    );
    const skillsText = await page.locator('#skills-list').innerText();
    if (!skillsText.includes('Slash')) {
      throw new Error('Skills panel missing Slash');
    }
    await page.keyboard.press('k');
    await page.waitForFunction(
      () => !document.querySelector('#skills-panel')?.classList.contains('open')
    );

    let state = await waitForCondition(
      page,
      (s) => s.player && s.resources?.length > 0 && s.mobs?.length > 0,
      TEST_TIMEOUT_MS,
      'initial state'
    );
    console.log(`Initial resources: ${state.resources.length}, mobs: ${state.mobs.length}`);

    const startPos = { x: state.player.x, z: state.player.z };
    await page.keyboard.down('w');
    await sleep(300);
    await advance(page, 700);
    await page.keyboard.up('w');

    state = await waitForCondition(
      page,
      (s) => s.player && distance(s.player, startPos) > 0.5,
      TEST_TIMEOUT_MS,
      'movement'
    );
    await page.evaluate(() => window.__game?.clearInput());

    const harvestRadius = state.world?.harvestRadius ?? 2;
    let resource = null;
    const testResource = state.resources.find((r) => r.id === 'r-test');
    if (testResource) {
      console.log(`Test resource at (${testResource.x.toFixed(2)}, ${testResource.z.toFixed(2)})`);
    } else {
      console.log('Test resource not found');
    }
    if (testResource && testResource.available) {
      await page.evaluate(
        ({ x, z }) => window.__game?.moveTo(x, z),
        { x: testResource.x, z: testResource.z }
      );
      state = await waitForCondition(
        page,
        (s) => s.player && distance(s.player, testResource) <= harvestRadius - 0.05,
        TEST_TIMEOUT_MS,
        'reach test resource'
      );
      resource = testResource;
    }

    const availableResources = state.resources.filter((r) => r.available);
    if (availableResources.length === 0) {
      throw new Error('No available resource found');
    }
    const obstacles = state.world?.obstacles ?? [];
    const visibleResources = availableResources.filter((r) =>
      hasLineOfSight(state.player, r, obstacles)
    );
    const candidates = visibleResources.length ? visibleResources : availableResources;
    const sortedResources = candidates.sort(
      (a, b) => distance(state.player, a) - distance(state.player, b)
    );

    let lastReachError = null;
    for (const candidate of sortedResources.slice(0, 5)) {
      if (resource) break;
      const distToResource = distance(state.player, candidate);
      const reachTimeoutMs = Math.max(
        TEST_TIMEOUT_MS,
        Math.ceil((distToResource / 3) * 1000 + 5000)
      );

      await page.evaluate(
        ({ x, z }) => window.__game?.moveTo(x, z),
        { x: candidate.x, z: candidate.z }
      );
      let reached = null;
      try {
        reached = await waitForCondition(
          page,
          (s) => s.player && distance(s.player, candidate) <= harvestRadius + 0.6,
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
      (s) => s.player && s.player.inv === invBefore + 1,
      TEST_TIMEOUT_MS,
      'harvest'
    );

    const updatedResource = state.resources.find((r) => r.id === resource.id);
    if (!updatedResource || updatedResource.available) {
      throw new Error('Resource did not become unavailable after harvest');
    }

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (s) => s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory open'
    );

    const equipSlotCount = await page.locator('#equipment-grid .equipment-slot').count();
    if (equipSlotCount !== 6) {
      throw new Error(`Equipment slot count mismatch: ${equipSlotCount}`);
    }

    const items = Array.isArray(state.inventory?.items) ? state.inventory.items : [];
    if (items.length === 0) {
      throw new Error('No inventory items after harvest');
    }
    const fromSlot = items[0].slot;
    const slotCount = state.inventory?.slots ?? 0;
    const occupied = new Set(items.map((item) => item.slot));
    let toSlot = null;
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
      (s) =>
        Array.isArray(s.inventory?.items) &&
        s.inventory.items.some((item) => item.slot === toSlot) &&
        !s.inventory.items.some((item) => item.slot === fromSlot),
      TEST_TIMEOUT_MS,
      'inventory swap'
    );

    const weaponSlotBox = await page
      .locator('.equipment-slot[data-slot=\"weapon\"]')
      .boundingBox();
    const emptySlot = fromSlot;
    const emptyBox = await page
      .locator(`.inventory-slot[data-index=\"${emptySlot}\"]`)
      .boundingBox();
    if (!weaponSlotBox || !emptyBox) {
      throw new Error('Weapon slot or empty inventory slot not found');
    }

    await page.mouse.move(
      weaponSlotBox.x + weaponSlotBox.width / 2,
      weaponSlotBox.y + weaponSlotBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(emptyBox.x + emptyBox.width / 2, emptyBox.y + emptyBox.height / 2, {
      steps: 6,
    });
    await page.mouse.up();

    state = await waitForCondition(
      page,
      (s) => s.inventory?.items?.some((item) => item.kind?.startsWith('weapon_')),
      TEST_TIMEOUT_MS,
      'unequip weapon'
    );

    const weaponItemSlot =
      state.inventory.items.find((item) => item.kind?.startsWith('weapon_'))?.slot ??
      emptySlot;
    const weaponItemBox = await page
      .locator(`.inventory-slot[data-index=\"${weaponItemSlot}\"]`)
      .boundingBox();
    if (!weaponItemBox) {
      throw new Error('Weapon inventory slot not found for re-equip');
    }

    await page.mouse.move(
      weaponItemBox.x + weaponItemBox.width / 2,
      weaponItemBox.y + weaponItemBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      weaponSlotBox.x + weaponSlotBox.width / 2,
      weaponSlotBox.y + weaponSlotBox.height / 2,
      { steps: 6 }
    );
    await page.mouse.up();

    state = await waitForCondition(
      page,
      (s) => s.player?.equipment?.weapon?.kind?.startsWith('weapon_'),
      TEST_TIMEOUT_MS,
      're-equip weapon'
    );

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (s) => !s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory closed'
    );

    const vendor = state.world?.vendors?.[0];
    if (!vendor) {
      throw new Error('No vendor found in world snapshot');
    }
    await page.evaluate(
      ({ x, z }) => window.__game?.moveTo(x, z),
      { x: vendor.x, z: vendor.z }
    );
    state = await waitForCondition(
      page,
      (s) =>
        s.player &&
        distance(s.player, vendor) <= (s.world?.vendorInteractRadius ?? 2.5) - 0.05,
      TEST_TIMEOUT_MS,
      'reach vendor'
    );

    await page.keyboard.press('e');
    await page.waitForSelector('#vendor-dialog.open');
    await page.click('#vendor-trade-btn');
    await page.waitForSelector('#vendor-panel.open');

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
      (s) =>
        (s.player?.currencyCopper ?? 0) > currencyBefore &&
        !s.inventory?.items?.some((item) => item.slot === sellSlot),
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
    await page.waitForFunction(() => !document.querySelector('#vendor-panel')?.classList.contains('open'));

    state = await getState(page);

    const attackTarget =
      state.mobs.find((m) => m.id === 'm-test' && !m.dead) ??
      state.mobs.find((m) => !m.dead);
    if (!attackTarget) {
      throw new Error('No alive mob available for attack test');
    }
    const classId = state.player?.classId ?? 'fighter';
    const attackRange =
      state.player?.weapon?.range ??
      (['ranger', 'priest', 'mage'].includes(classId) ? 6 : 2);
    const attackReachThreshold = Math.max(0.2, attackRange - 0.1);
    const attackMoveTarget = { x: attackTarget.x, z: attackTarget.z };
    await page.evaluate(
      ({ x, z }) => window.__game?.moveTo(x, z),
      attackMoveTarget
    );
    state = await waitForCondition(
      page,
      (s) => s.player && distance(s.player, attackMoveTarget) <= attackReachThreshold,
      Math.max(TEST_TIMEOUT_MS, 30000),
      'reach attack target'
    );

    await page.keyboard.press('1');
    state = await waitForCondition(
      page,
      (s) =>
        Array.isArray(s.combat?.recentEvents) &&
        s.combat.recentEvents.some((event) => event.kind === 'basic_attack'),
      TEST_TIMEOUT_MS,
      'combat event'
    );
    await sleep(950);
    await advance(page, 200);

    let updatedTarget = state.mobs.find((m) => m.id === attackTarget.id);
    const levelBefore = state.player.level ?? 1;
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('1');
      await sleep(950);
      await advance(page, 200);
      state = await getState(page);
      updatedTarget = state.mobs.find((m) => m.id === attackTarget.id);
      if (!updatedTarget) break;
      if (updatedTarget.dead || updatedTarget.hp <= 0) break;
    }
    if (!updatedTarget) {
      throw new Error('Attack target missing from state');
    }
    if (!updatedTarget.dead) {
      throw new Error('Expected attack target to die from basic attacks');
    }
    if ((state.player.level ?? 1) <= levelBefore) {
      throw new Error('Expected level up after mob kill');
    }

    const liveMobs = state.mobs.filter((m) => !m.dead);
    const obstaclesForMobs = state.world?.obstacles ?? [];
    const losMobs = liveMobs.filter((m) => hasLineOfSight(state.player, m, obstaclesForMobs));
    const damagePool = (losMobs.length ? losMobs : liveMobs).filter(
      (m) => m.id !== attackTarget.id
    );
    const mobDamageTarget =
      damagePool.find((mob) => mob.id === 'm-chase') ??
      damagePool.reduce((closest, current) => {
        if (!closest) return current;
        return distance(state.player, current) < distance(state.player, closest)
          ? current
          : closest;
      }, null) ?? liveMobs[0];
    if (!mobDamageTarget) {
      throw new Error('No mob available for damage test');
    }
    const hpBefore = state.player.hp;
    const damageStart = Date.now();
    const damageTimeoutMs = Math.max(TEST_TIMEOUT_MS, 30000);
    let damagedState = null;
    while (Date.now() - damageStart < damageTimeoutMs) {
      const current = await getState(page);
      if (!current.player) break;
      const liveMobsNow = current.mobs.filter((m) => !m.dead);
      if (liveMobsNow.length === 0) break;
      const obstaclesNow = current.world?.obstacles ?? [];
      const losNow = liveMobsNow.filter((m) => hasLineOfSight(current.player, m, obstaclesNow));
      const candidatesNow = losNow.length ? losNow : liveMobsNow;
      const mob = candidatesNow.reduce((closest, next) => {
        if (!closest) return next;
        return distance(current.player, next) < distance(current.player, closest)
          ? next
          : closest;
      }, null);
      if (!mob) break;
      await page.evaluate(
        ({ x, z }) => window.__game?.moveTo(x, z),
        { x: mob.x, z: mob.z }
      );
      await advance(page, 500);
      await sleep(250);
      const after = await getState(page);
      if (after.player && after.player.hp < hpBefore) {
        damagedState = after;
        break;
      }
    }
    if (!damagedState) {
      throw new Error('Timed out waiting for mob damage.');
    }
    state = damagedState;

    state = await waitForCondition(
      page,
      (s) => s.player && s.player.dead,
      DEATH_TIMEOUT_MS,
      'player death'
    );

    const respawnText = await page.locator('#hud-respawn').innerText();
    const respawnSeconds = Number.parseInt(respawnText.replace('s', ''), 10);
    if (!Number.isFinite(respawnSeconds)) {
      throw new Error(`Respawn HUD not numeric: "${respawnText}"`);
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

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
