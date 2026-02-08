import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import process from 'node:process';

const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 3001;
const BASE_URL = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 20000;
const DEATH_TIMEOUT_MS = 30000;

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
        score: lastState.player.score,
        dead: lastState.player.dead,
      }
    : null;
  throw new Error(
    `Timed out waiting for ${label}. Last player state: ${JSON.stringify(lastPlayer)}`
  );
}

async function run() {
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT), E2E_TEST: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(server);

    const browser = await chromium.launch({
      headless: true,
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    });
    const page = await browser.newPage();

    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');

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

    // Reset between scenarios to avoid stale input/state.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');
    state = await waitForCondition(
      page,
      (s) => s.player && s.resources?.length > 0 && s.mobs?.length > 0,
      TEST_TIMEOUT_MS,
      'post-reload state'
    );
    console.log(`Post-reload resources: ${state.resources.length}, mobs: ${state.mobs.length}`);

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
        (s) => s.player && distance(s.player, testResource) <= harvestRadius + 0.05,
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

      if (distance(reached.player, candidate) <= harvestRadius + 0.05) {
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

    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (s) => !s.inventory?.open,
      TEST_TIMEOUT_MS,
      'inventory closed'
    );

    const scoreBefore = state.player.score;
    await page.evaluate(() => window.__game?.moveTo(0, 0));
    const distToBase = distance(state.player, { x: 0, z: 0 });
    const baseTimeoutMs = Math.max(
      TEST_TIMEOUT_MS,
      Math.ceil((distToBase / 3) * 1000 + 3000)
    );
    state = await waitForCondition(
      page,
      (s) => s.player && distance(s.player, { x: 0, z: 0 }) <= (s.world?.base?.radius ?? 8) + 1,
      baseTimeoutMs,
      'reach base'
    );

    state = await waitForCondition(
      page,
      (s) => s.player && s.player.inv === 0 && s.player.score > scoreBefore,
      TEST_TIMEOUT_MS,
      'deposit'
    );

    const testMob = state.mobs.find((m) => m.id === 'm-test');
    const mob = testMob
      ? testMob
      : state.mobs.reduce((closest, current) => {
          if (!closest) return current;
          return distance(state.player, current) < distance(state.player, closest)
            ? current
            : closest;
        }, null);
    const hpBefore = state.player.hp;
    await page.evaluate(
      ({ x, z }) => window.__game?.moveTo(x, z),
      { x: mob.x, z: mob.z }
    );
    state = await waitForCondition(
      page,
      (s) => s.player && s.player.hp < hpBefore,
      TEST_TIMEOUT_MS,
      'mob damage'
    );

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
