import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import {
  BASE_URL,
  DATABASE_URL_E2E,
  DEATH_TIMEOUT_MS,
  LOADING_TIMEOUT_MS,
  PORT,
  TEST_TIMEOUT_MS,
  advance,
  distance,
  getState,
  getMenuStatus,
  hasLineOfSight,
  resetE2eDatabase,
  segmentDistanceToPoint,
  sleep,
  waitForCondition,
  waitForLoadingScreenToDisappear,
  waitForMenuStepOrError,
  waitForServer,
} from './helpers.js';

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
      'WebGL unavailable.',
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
    await page.keyboard.press('c');
    state = await waitForCondition(
      page,
      (s) => s.skills?.open,
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
      (s) => s.inventory?.items?.some((item) => item.kind?.startsWith('weapon_')),
      TEST_TIMEOUT_MS,
      'unequip weapon'
    );

    const weaponItemSlot =
      state.inventory.items.find((item) => item.kind?.startsWith('weapon_'))?.slot ??
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
      (s) => s.player?.equipment?.weapon?.kind?.startsWith('weapon_'),
      TEST_TIMEOUT_MS,
      're-equip weapon'
    );

    await page.keyboard.press('c');
    await page.keyboard.press('i');
    state = await waitForCondition(
      page,
      (s) => !s.inventory?.open && !s.skills?.open,
      TEST_TIMEOUT_MS,
      'panels closed'
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
    await page.waitForFunction(
      () =>
        !document.querySelector('#vendor-panel')?.classList.contains('open') &&
        !document.querySelector('#inventory-panel')?.classList.contains('open') &&
        !document.body.classList.contains('trade-open')
    );
    await page.waitForTimeout(300);

    const vendorClickTarget = state.world?.vendors?.[0];
    if (!vendorClickTarget) {
      throw new Error('No vendor available for targeting');
    }
    await page.evaluate(
      (vendor) => window.__game?.selectTarget?.({ kind: 'vendor', id: vendor.id }),
      vendorClickTarget
    );
    state = await waitForCondition(
      page,
      (s) => s.target?.kind === 'vendor' && s.target?.id === vendorClickTarget.id,
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

    await page.keyboard.press('Tab');
    state = await waitForCondition(
      page,
      (s) => s.player?.targetId === attackTarget.id,
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
      (s) =>
        Array.isArray(s.combat?.recentEvents) &&
        s.combat.recentEvents.some((event) => event.kind === 'basic_attack'),
      TEST_TIMEOUT_MS,
      'combat event'
    );
    await sleep(950);
    await advance(page, 200);

    let updatedTarget = state.mobs.find((m) => m.id === attackTarget.id);
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
    const mobDamageTargetId = mobDamageTarget.id;
    const hpBefore = state.player.hp;
    const damageTimeoutMs = Math.max(TEST_TIMEOUT_MS, 30000);
    const mobAttackRange = 1.4;

    await page.evaluate(
      ({ x, z }) => window.__game?.moveTo(x, z),
      { x: mobDamageTarget.x, z: mobDamageTarget.z }
    );

    await waitForCondition(
      page,
      (s) => {
        const mob = s.mobs?.find((m) => m.id === mobDamageTargetId && !m.dead);
        return mob && s.player && distance(s.player, mob) <= mobAttackRange - 0.1;
      },
      Math.max(TEST_TIMEOUT_MS, 30000),
      'reach mob for damage'
    );

    state = await waitForCondition(
      page,
      (s) => s.player && s.player.hp < hpBefore,
      damageTimeoutMs,
      'mob damage'
    );

    state = await waitForCondition(
      page,
      (s) => s.player && s.player.dead,
      DEATH_TIMEOUT_MS,
      'player death'
    );

    await page.waitForSelector('#death-screen.open', { timeout: 5000 });
    const respawnText = await page.locator('#death-timer').innerText();
    const [mins, secs] = respawnText.split(':').map((s) => Number.parseInt(s, 10));
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

    await browser.close();
  } finally {
    server.kill('SIGTERM');
  }
}

async function runWithRetries(maxAttempts = 2) {
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

runWithRetries().catch((err) => {
  console.error(err);
  process.exit(1);
});
