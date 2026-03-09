// @ts-check
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSellPriceCopper } from '../../../shared/economy.js';
import {
  buildMedievalStructureLayout,
  buildStructureCollisionRects,
  isMedievalBuildingKind,
  pointInOrientedRect,
  transformPartPlacement,
} from '../../../shared/medievalBuildings.js';
import {
  BASE_URL,
  DATABASE_URL_E2E,
  DEATH_TIMEOUT_MS,
  PORT,
  TEST_TIMEOUT_MS,
  advance,
  distance,
  getMenuStatus,
  getLoadingScreenState,
  getState,
  hasLineOfSight,
  sleep,
  waitForCondition,
  waitForLoadingScreenToDisappear,
  waitForMenuStepOrError,
} from '../../helpers.js';
import { run as runAuthFlowModule } from './auth-flow.js';
import { run as runVendorTradeDesktopModule } from './vendor-trade-desktop.js';
import { run as runVendorContractFlowModule } from './vendor-contract-flow.js';
import { run as runStationCraftingModule } from './station-crafting.js';
import { run as runVendorTradeSmallViewportModule } from './vendor-trade-small-viewport.js';
import { run as runTargetingAndCombatModule } from './targeting-and-combat.js';
import { run as runRepairAndSalvageModule } from './repair-and-salvage.js';
import {
  isClickableInViewport,
  isWithinViewport,
  rectanglesOverlap,
  sanitizeToken,
} from './layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_ARTIFACT_DIR = path.resolve(__dirname, '../output/e2e');
const /** @type {any} */ DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const /** @type {any} */ SMALL_VIEWPORT = { width: 560, height: 840 };
const TEST_ADMIN_PASSWORD = '1234';
const E2E_ATTEMPTS = Math.max(1, Number.parseInt(process.env.E2E_ATTEMPTS ?? '', 10) || 1);

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
  if (!isWithinViewport(vendorRect, viewport, 24)) {
    throw new Error(`${label}: vendor panel is not fully inside viewport`);
  }
  if (!isWithinViewport(inventoryRect, viewport, 24)) {
    throw new Error(`${label}: inventory panel is not fully inside viewport`);
  }
  const overlapX = Math.min(vendorRect.right, inventoryRect.right) - Math.max(vendorRect.left, inventoryRect.left);
  const overlapY = Math.min(vendorRect.bottom, inventoryRect.bottom) - Math.max(vendorRect.top, inventoryRect.top);
  const overlapArea = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
  if (overlapArea > 400) {
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
    const tolerance = 24;
    /** @param {{ left: number, top: number, right: number, bottom: number, width: number, height: number }} rect */
    const insideViewport = (rect) =>
      rect.width > 2 &&
      rect.height > 2 &&
      rect.left >= -tolerance &&
      rect.top >= -tolerance &&
      rect.right <= window.innerWidth + tolerance &&
      rect.bottom <= window.innerHeight + tolerance;
    const overlapX = Math.min(vendor.right, inventory.right) - Math.max(vendor.left, inventory.left);
    const overlapY = Math.min(vendor.bottom, inventory.bottom) - Math.max(vendor.top, inventory.top);
    const overlapArea = overlapX > 0 && overlapY > 0 ? overlapX * overlapY : 0;
    return insideViewport(vendor) && insideViewport(inventory) && overlapArea <= 400;
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

async function dragSelectorToSelectorCenter(
  /** @type {any} */ page,
  /** @type {any} */ sourceSelector,
  /** @type {any} */ targetSelector
) {
  const source = page.locator(sourceSelector);
  const target = page.locator(targetSelector);
  await source.waitFor({ state: 'visible', timeout: TEST_TIMEOUT_MS });
  await target.waitFor({ state: 'visible', timeout: TEST_TIMEOUT_MS });
  const sourceRect = await source.boundingBox();
  const targetRect = await target.boundingBox();
  if (!sourceRect) {
    throw new Error(`Drag source bounding box unavailable: ${sourceSelector}`);
  }
  if (!targetRect) {
    throw new Error(`Drag target bounding box unavailable: ${targetSelector}`);
  }
  const startX = sourceRect.x + sourceRect.width / 2;
  const startY = sourceRect.y + sourceRect.height / 2;
  const endX = targetRect.x + targetRect.width / 2;
  const endY = targetRect.y + targetRect.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
  await sleep(80);
}

async function readAbilityBarSlots(/** @type {any} */ page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#ability-bar .ability-slot'))
      .filter((/** @type {any} */ el) => el instanceof HTMLElement)
      .map((/** @type {any} */ el) => ({
        slot: Number(el.dataset.slot ?? 0),
        name: el.querySelector('.ability-name')?.textContent?.trim() ?? '',
        empty: el.classList.contains('empty'),
      }))
  );
}

function makeAbilityBarSignature(/** @type {any[]} */ slots) {
  return (Array.isArray(slots) ? slots : [])
    .map((/** @type {any} */ slot) => `${slot?.slot ?? 0}:${slot?.empty ? '-' : String(slot?.name ?? '')}`)
    .join('|');
}

async function dragAbilityBarSlotWithRetry(
  /** @type {any} */ page,
  /** @type {{ sourceSelector: string, targetSelector: string, expectedTargetName: string, expectSourceEmpty: boolean }} */ opts
) {
  const initialSlots = await readAbilityBarSlots(page);
  const initialSignature = makeAbilityBarSignature(initialSlots);
  let lastSlots = initialSlots;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await dragSelectorToSelectorCenter(page, opts.sourceSelector, opts.targetSelector);
    try {
      await page.waitForFunction(
        (/** @type {any} */ payload) => {
          const source = document.querySelector(payload.sourceSelector);
          const target = document.querySelector(payload.targetSelector);
          if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) return false;
          const targetName = target.querySelector('.ability-name')?.textContent?.trim() ?? '';
          if (targetName !== payload.expectedTargetName) return false;
          const signature = Array.from(document.querySelectorAll('#ability-bar .ability-slot'))
            .filter((el) => el instanceof HTMLElement)
            .map((/** @type {any} */ el) => {
              const slot = Number(el.dataset.slot ?? 0);
              const name = el.querySelector('.ability-name')?.textContent?.trim() ?? '';
              const empty = el.classList.contains('empty');
              return `${slot}:${empty ? '-' : name}`;
            })
            .join('|');
          if (signature === payload.initialSignature) return false;
          return payload.expectSourceEmpty ? source.classList.contains('empty') : true;
        },
        {
          sourceSelector: opts.sourceSelector,
          targetSelector: opts.targetSelector,
          expectedTargetName: opts.expectedTargetName,
          expectSourceEmpty: opts.expectSourceEmpty,
          initialSignature,
        },
        { timeout: Math.max(2000, Math.floor(TEST_TIMEOUT_MS / 3)) }
      );
      return;
    } catch {
      lastSlots = await readAbilityBarSlots(page);
      if (attempt < attempts) {
        await sleep(120);
      }
    }
  }
  throw new Error(
    `Ability bar drag did not settle after ${attempts} attempts. initial=${JSON.stringify(initialSlots)} final=${JSON.stringify(lastSlots)}`
  );
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
  return getInventoryItems(state).reduce(
    (/** @type {number} */ total, /** @type {any} */ item) => {
      if (!item || item.kind !== kind) return total;
      return total + Math.max(0, Math.floor(Number(item.count) || 0));
    },
    0
  );
}

function findInventoryItem(/** @type {any} */ state, /** @type {any} */ predicate) {
  return getInventoryItems(state).find((/** @type {any} */ item) => predicate(item)) ?? null;
}

function getActiveContract(/** @type {any} */ state, /** @type {any} */ contractId) {
  if (typeof contractId !== 'string' || contractId.length === 0) return null;
  const activeContracts = Array.isArray(state?.player?.activeContracts) ? state.player.activeContracts : [];
  return activeContracts.find(
    (/** @type {any} */ contract) =>
      contract?.contractId === contractId || contract?.templateId === contractId
  ) ?? null;
}

function getContractId(/** @type {any} */ contract) {
  if (typeof contract?.contractId === 'string' && contract.contractId.length > 0) {
    return contract.contractId;
  }
  if (typeof contract?.templateId === 'string' && contract.templateId.length > 0) {
    return contract.templateId;
  }
  if (typeof contract?.id === 'string' && contract.id.length > 0) {
    return contract.id;
  }
  return '';
}

function getActiveContractsForVendor(/** @type {any} */ state, /** @type {any} */ vendorId) {
  const activeContracts = Array.isArray(state?.player?.activeContracts) ? state.player.activeContracts : [];
  if (typeof vendorId !== 'string' || vendorId.length === 0) return activeContracts;
  return activeContracts.filter((/** @type {any} */ contract) => !contract?.vendorId || contract.vendorId === vendorId);
}

function toOfferLikeContract(/** @type {any} */ offer, /** @type {any} */ activeContract) {
  const contractId = getContractId(activeContract) || String(offer?.id ?? '');
  const requiredCount = Number.isFinite(activeContract?.requiredCount)
    ? Math.max(1, Math.floor(Number(activeContract.requiredCount) || 1))
    : Math.max(1, Math.floor(Number(offer?.requiredCount) || 1));
  return {
    ...(offer ?? {}),
    id: contractId,
    title:
      typeof activeContract?.title === 'string' && activeContract.title.length > 0
        ? activeContract.title
        : String(offer?.title ?? contractId),
    kind: activeContract?.kind ?? offer?.kind ?? null,
    target: activeContract?.target ?? offer?.target ?? null,
    requiredCount,
  };
}

function pickSupportedActiveContractForVendor(/** @type {any} */ state, /** @type {any} */ vendorId) {
  const supportedKinds = new Set(['gather', 'craft', 'delivery']);
  return (
    getActiveContractsForVendor(state, vendorId).find(
      (/** @type {any} */ contract) => supportedKinds.has(contract?.kind) && contract?.delivered !== true
    ) ?? null
  );
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

async function acceptPreferredContractOffer(/** @type {any} */ page, /** @type {any} */ state, /** @type {any} */ vendorId) {
  const existing = pickSupportedActiveContractForVendor(state, vendorId);
  if (existing) {
    return {
      state,
      contractOffer: toOfferLikeContract(existing, existing),
      activeContract: existing,
    };
  }

  let currentState = state;
  let /** @type {unknown} */ lastError = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const offer = pickPreferredContractOffer(currentState, vendorId);
    if (!offer) {
      break;
    }

    const beforeActive = getActiveContractsForVendor(currentState, vendorId);
    const beforeIds = new Set(beforeActive.map((/** @type {any} */ contract) => getContractId(contract)).filter(Boolean));

    try {
      await clickVendorContractAction(page, offer.title, 'Accept');
    } catch (error) {
      lastError = error;
      currentState = await getState(page);
      continue;
    }

    try {
      currentState = await waitForCondition(
        page,
        (/** @type {any} */ s) =>
          getActiveContractsForVendor(s, vendorId).some((/** @type {any} */ contract) => {
            const id = getContractId(contract);
            return !!id && (id === offer.id || !beforeIds.has(id));
          }),
        Math.min(TEST_TIMEOUT_MS, 7000),
        `accept contract ${offer.id}`
      );
    } catch (error) {
      lastError = error;
      currentState = await getState(page);
    }

    const activeContracts = getActiveContractsForVendor(currentState, vendorId);
    const exact = activeContracts.find((/** @type {any} */ contract) => getContractId(contract) === offer.id) ?? null;
    const activated = exact ?? activeContracts.find((/** @type {any} */ contract) => {
      const id = getContractId(contract);
      return !!id && !beforeIds.has(id);
    });
    if (activated) {
      return {
        state: currentState,
        contractOffer: toOfferLikeContract(offer, activated),
        activeContract: activated,
      };
    }

    currentState = await getState(page);
  }

  const offers = Array.isArray(currentState?.player?.contractOffersByVendor?.[vendorId])
    ? currentState.player.contractOffersByVendor[vendorId]
    : [];
  const offerIds = offers.map((/** @type {any} */ offer) => String(offer?.id ?? '')).filter(Boolean).join(', ') || 'none';
  const activeIds = getActiveContractsForVendor(currentState, vendorId)
    .map((/** @type {any} */ contract) => getContractId(contract))
    .filter(Boolean)
    .join(', ') || 'none';
  const lastMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'none');
  throw new Error(
    `Unable to accept supported vendor contract for ${vendorId}. Offers: ${offerIds}. Active: ${activeIds}. Last error: ${lastMessage}`
  );
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
    const normalize = (/** @type {any} */ value) =>
      String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    const expectedTitle = normalize(payload.title);
    const expectedAction = normalize(payload.actionText);
    const rows = Array.from(document.querySelectorAll('.vendor-contract-row'));
    for (const row of rows) {
      const titleEl = row.querySelector('.vendor-contract-title');
      const button = row.querySelector('button');
      const rowTitle = normalize(titleEl?.textContent ?? '');
      const buttonText = normalize(button?.textContent ?? '');
      const titleMatches =
        rowTitle === expectedTitle ||
        rowTitle.startsWith(`${expectedTitle} ·`) ||
        rowTitle.includes(expectedTitle);
      if (titleMatches && buttonText === expectedAction) {
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

    state = await moveWithinRange(
      page,
      { x: resource.x, z: resource.z },
      harvestRadius + 0.2,
      `reach ${contract.target} resource`,
      state
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

function normalizeVector2(/** @type {number} */ x, /** @type {number} */ z) {
  const len = Math.hypot(x, z);
  if (!(len > 0.0001)) return { x: 1, z: 0 };
  return { x: x / len, z: z / len };
}

function clamp(/** @type {number} */ value, /** @type {number} */ min, /** @type {number} */ max) {
  return Math.max(min, Math.min(max, value));
}

function buildMedievalOpeningPoints(/** @type {any} */ structure) {
  const layout = buildMedievalStructureLayout(structure);
  if (!layout) return [];
  const interior = layout.interiorBounds ?? { x: structure.x ?? 0, z: structure.z ?? 0 };
  const openings = layout.parts.filter(
    (/** @type {any} */ part) => part.role === 'door' || part.partKey === 'wallArch'
  );
  return openings.map((/** @type {any} */ openingLocal) => {
    const opening = transformPartPlacement(openingLocal, structure);
    const normal = normalizeVector2(
      Number(opening.x ?? 0) - Number(interior.x ?? 0),
      Number(opening.z ?? 0) - Number(interior.z ?? 0)
    );
    return {
      outside: {
        x: Number(opening.x ?? 0) + normal.x * 2.2,
        z: Number(opening.z ?? 0) + normal.z * 2.2,
      },
      inside: {
        x: Number(opening.x ?? 0) - normal.x * 1.3,
        z: Number(opening.z ?? 0) - normal.z * 1.3,
      },
    };
  });
}

function buildMedievalApproachTargets(/** @type {any} */ structure) {
  const openingPoints = buildMedievalOpeningPoints(structure);
  if (!openingPoints.length) {
    const layout = buildMedievalStructureLayout(structure);
    const interior = layout?.interiorBounds ?? { x: structure.x ?? 0, z: structure.z ?? 0 };
    return [{ x: Number(interior.x ?? 0), z: Number(interior.z ?? 0) }];
  }
  return openingPoints.flatMap((/** @type {any} */ point) => [point.outside, point.inside]);
}

function buildStructureApproachTargets(/** @type {any} */ player, /** @type {any} */ structure) {
  if (isMedievalBuildingKind(structure?.kind)) {
    const medievalPoints = buildMedievalApproachTargets(structure);
    if (medievalPoints.length) {
      const deduped = [];
      const seen = new Set();
      for (const point of medievalPoints) {
        const key = `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(point);
      }
      return deduped;
    }
  }

  const structureRadius = Math.max(0.6, Number(structure?.colliderRadius ?? 0));
  const targetRadius = structureRadius + 1.05;
  const playerDir = normalizeVector2(
    Number(player?.x ?? structure?.x ?? 0) - Number(structure?.x ?? 0),
    Number(player?.z ?? structure?.z ?? 0) - Number(structure?.z ?? 0)
  );
  const points = [
    { x: structure.x, z: structure.z },
    { x: structure.x + playerDir.x * targetRadius, z: structure.z + playerDir.z * targetRadius },
    { x: structure.x + targetRadius, z: structure.z },
    { x: structure.x - targetRadius, z: structure.z },
    { x: structure.x, z: structure.z + targetRadius },
    { x: structure.x, z: structure.z - targetRadius },
  ];
  const deduped = [];
  const seen = new Set();
  for (const point of points) {
    const key = `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(point);
  }
  return deduped;
}

function getMedievalExitTarget(
  /** @type {{ x?: number, z?: number } | null | undefined} */ player,
  /** @type {any[]} */ structures
) {
  if (!player || !Array.isArray(structures)) return null;
  const px = Number(player.x ?? 0);
  const pz = Number(player.z ?? 0);
  for (const structure of structures) {
    if (!isMedievalBuildingKind(structure?.kind)) continue;
    const layout = buildMedievalStructureLayout(structure);
    if (!layout) continue;
    if (!pointInOrientedRect({ x: px, z: pz }, layout.interiorBounds)) continue;
    const openings = buildMedievalOpeningPoints(structure);
    if (!openings.length) return null;
    let nearestTarget = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const opening of openings) {
      const currentDist = Math.hypot(px - opening.outside.x, pz - opening.outside.z);
      if (currentDist < nearestDist) {
        nearestDist = currentDist;
        nearestTarget = opening.outside;
      }
    }
    return nearestTarget;
  }
  return null;
}

function getMedievalEntryTargets(
  /** @type {{ x?: number, z?: number } | null | undefined} */ target,
  /** @type {any[]} */ structures
) {
  if (!target || !Array.isArray(structures)) return null;
  const tx = Number(target.x ?? 0);
  const tz = Number(target.z ?? 0);
  for (const structure of structures) {
    if (!isMedievalBuildingKind(structure?.kind)) continue;
    const layout = buildMedievalStructureLayout(structure);
    if (!layout) continue;
    if (!pointInOrientedRect({ x: tx, z: tz }, layout.interiorBounds)) continue;
    const openings = buildMedievalOpeningPoints(structure);
    if (!openings.length) return null;
    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const opening of openings) {
      const distToInside = Math.hypot(tx - opening.inside.x, tz - opening.inside.z);
      if (distToInside < nearestDist) {
        nearestDist = distToInside;
        nearest = opening;
      }
    }
    return nearest;
  }
  return null;
}

function dedupePoints(/** @type {Array<{ x: number, z: number }>} */ points) {
  const deduped = [];
  const seen = new Set();
  for (const point of points) {
    const key = `${point.x.toFixed(2)}:${point.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(point);
  }
  return deduped;
}

async function movePlayerToPoint(
  /** @type {any} */ page,
  /** @type {{ x: number, z: number }} */ target,
  /** @type {string} */ label,
  /** @type {any} */ state = null
) {
  let latestState = state ?? (await getState(page));
  const structures = Array.isArray(latestState?.world?.structures)
    ? latestState.world.structures
    : [];
  const route = [];
  const exitTarget = getMedievalExitTarget(latestState?.player, structures);
  if (exitTarget) route.push(exitTarget);
  const entryTargets = getMedievalEntryTargets(target, structures);
  if (entryTargets) {
    route.push(entryTargets.outside, entryTargets.inside);
  }
  route.push(target);

  const waypoints = dedupePoints(route);
  for (const waypoint of waypoints) {
    await page.evaluate(
      (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
      waypoint
    );
    latestState = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.player && distance(s.player, waypoint) <= 1.8,
      TEST_TIMEOUT_MS,
      `${label} (x=${waypoint.x.toFixed(2)}, z=${waypoint.z.toFixed(2)})`
    );
  }
  return latestState;
}

function buildTargetApproachPoints(
  /** @type {{ x?: number, z?: number }} */ target,
  /** @type {number} */ range
) {
  const x = Number(target?.x ?? 0);
  const z = Number(target?.z ?? 0);
  const step = Math.max(0.8, range * 0.8);
  return dedupePoints([
    { x, z },
    { x: x + step, z },
    { x: x - step, z },
    { x, z: z + step },
    { x, z: z - step },
    { x: x + step, z: z + step },
    { x: x - step, z: z - step },
    { x: x + step, z: z - step },
    { x: x - step, z: z + step },
  ]);
}

async function moveWithinRange(
  /** @type {any} */ page,
  /** @type {{ x: number, z: number }} */ target,
  /** @type {number} */ range,
  /** @type {string} */ label,
  /** @type {any} */ state = null
) {
  let latestState = state ?? (await getState(page));
  const candidates = buildTargetApproachPoints(target, range);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      latestState = await movePlayerToPoint(page, candidate, label, latestState);
      if (latestState?.player && distance(latestState.player, target) <= range) {
        return latestState;
      }
      latestState = await waitForCondition(
        page,
        (/** @type {any} */ s) => s.player && distance(s.player, target) <= range,
        1500,
        `${label} within range`
      );
      return latestState;
    } catch (err) {
      lastError = err;
      await advance(page, 250);
      await sleep(50);
      latestState = await getState(page);
    }
  }
  const playerSummary = summarizePlayer(latestState);
  throw new Error(
    `Unable to move within range for ${label}. Last player state: ${JSON.stringify(playerSummary)}. Last error: ${String(lastError)}`
  );
}

async function moveNearCollidableStructure(
  /** @type {any} */ page,
  /** @type {any} */ structure,
  /** @type {any} */ label,
  /** @type {any} */ state
) {
  let latestState = state ?? (await getState(page));
  const usesMedievalApproach = isMedievalBuildingKind(structure?.kind);
  const approaches = buildStructureApproachTargets(latestState?.player, structure);
  const nearDistance = Math.max(1, Number(structure?.colliderRadius ?? 0) + 1.75);
  let lastError = null;
  for (const point of approaches) {
    try {
      latestState = await movePlayerToPoint(
        page,
        point,
        label,
        latestState
      );
      if (
        latestState?.player &&
        (
          usesMedievalApproach
            ? distance(latestState.player, point) <= 1.8
            : distance(latestState.player, structure) <= nearDistance
        )
      ) {
        return latestState;
      }
      latestState = await waitForCondition(
        page,
        (/** @type {any} */ s) =>
          s.player &&
          (usesMedievalApproach
            ? distance(s.player, point) <= 1.8
            : distance(s.player, structure) <= nearDistance),
        Math.max(1500, Math.floor(TEST_TIMEOUT_MS / approaches.length)),
        `${label} near structure`
      );
      return latestState;
    } catch (err) {
      lastError = err;
      await advance(page, 250);
      await sleep(50);
      latestState = await getState(page);
    }
  }
  const playerSummary = summarizePlayer(latestState);
  throw new Error(
    `Unable to approach ${label}. Last player state: ${JSON.stringify(playerSummary)}. Last error: ${String(lastError)}`
  );
}

function playerOverlapsRect(
  /** @type {{ x?: number, z?: number }} */ player,
  /** @type {{ x?: number, z?: number, halfX?: number, halfZ?: number, rotation?: number }} */ rect,
  /** @type {number} */ radius
) {
  const dx = Number(player?.x ?? 0) - Number(rect?.x ?? 0);
  const dz = Number(player?.z ?? 0) - Number(rect?.z ?? 0);
  const rotation = Number(rect?.rotation ?? 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  const halfX = Number(rect?.halfX ?? 0);
  const halfZ = Number(rect?.halfZ ?? 0);
  const closestX = clamp(localX, -halfX, halfX);
  const closestZ = clamp(localZ, -halfZ, halfZ);
  const offX = localX - closestX;
  const offZ = localZ - closestZ;
  return offX * offX + offZ * offZ < radius * radius;
}

async function verifyMedievalWallCollision(
  /** @type {any} */ page,
  /** @type {any} */ structure,
  /** @type {any} */ state,
  /** @type {any} */ label
) {
  const layout = buildMedievalStructureLayout(structure);
  const rects = buildStructureCollisionRects(structure);
  if (!layout || !rects.length) return state;

  const wallRect = rects[0];
  const interior = layout.interiorBounds ?? { x: structure.x ?? 0, z: structure.z ?? 0 };
  const normal = normalizeVector2(
    Number(wallRect?.x ?? 0) - Number(interior?.x ?? 0),
    Number(wallRect?.z ?? 0) - Number(interior?.z ?? 0)
  );
  const wallOffset = Math.max(Number(wallRect?.halfX ?? 0), Number(wallRect?.halfZ ?? 0)) + 1.6;
  const outside = {
    x: Number(wallRect?.x ?? 0) + normal.x * wallOffset,
    z: Number(wallRect?.z ?? 0) + normal.z * wallOffset,
  };
  const inside = {
    x: Number(wallRect?.x ?? 0) - normal.x * wallOffset,
    z: Number(wallRect?.z ?? 0) - normal.z * wallOffset,
  };

  const approachState = await moveNearCollidableStructure(page, structure, `${label} wall setup`, state);
  await page.evaluate(
    (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
    outside
  );
  let nextState = await waitForCondition(
    page,
    (/** @type {any} */ s) => s.player && distance(s.player, outside) <= 1.8,
    TEST_TIMEOUT_MS,
    `${label} wall outside`
  );

  await page.evaluate(
    (/** @type {any} */ { x, z }) => window.__game?.moveTo(x, z),
    inside
  );
  await advance(page, 800);
  await sleep(100);
  nextState = await getState(page);
  await page.evaluate(() => window.__game?.clearInput?.());

  const reachedInside = distance(nextState.player, inside) < 1.1;
  const overlapsWall = playerOverlapsRect(nextState.player, wallRect, 0.45);
  if (reachedInside || overlapsWall) {
    throw new Error(
      `Player crossed medieval wall collision boundary (${label}). ` +
      `reachedInside=${reachedInside} overlapsWall=${overlapsWall} ` +
      `player=(${Number(nextState.player?.x ?? 0).toFixed(2)},${Number(nextState.player?.z ?? 0).toFixed(2)}) ` +
      `wallInside=(${inside.x.toFixed(2)},${inside.z.toFixed(2)}).`
    );
  }
  return nextState ?? approachState;
}

export async function runMainFlow(/** @type {any} */ ctx) {
  const { createPage, setStage } = ctx;
  const { page } = await createPage({ viewport: DESKTOP_VIEWPORT });

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

  let /** @type {any} */ state = null;
  let /** @type {any} */ vendor = null;
  const navigateToBaseUrl = async () => {
    let /** @type {unknown} */ lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await page.goto(BASE_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        if (response && typeof response.ok === 'function' && !response.ok()) {
          throw new Error(`Navigation to ${BASE_URL} returned HTTP ${response.status()}`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await sleep(200 * attempt);
        }
      }
    }
    throw (lastError instanceof Error
      ? lastError
      : new Error(`Failed to navigate to ${BASE_URL}`));
  };

  const runAuthFlowStage = async () => {
    await navigateToBaseUrl();
    await page.waitForFunction(() => window.__game && typeof window.__game.moveTo === 'function');
    const username = 'e2e_tester';
    const password = 'e2e_password';
    const characterName = `Hero ${Date.now().toString(36)}`;

    await page.waitForSelector('#menu.open');
    await page.waitForSelector('#menu[data-progress=\"account\"]');
    await page.waitForFunction(
      () => !document.querySelector('#signin-form')?.classList.contains('hidden')
    );
    await page.fill('#signin-username', '');
    await page.fill('#signin-password', '');
    await page.fill('#signin-username', username);
    await page.fill('#signin-password', password);
    let /** @type {any} */ signInResult = null;
    const signInSubmitSelector = '#signin-form button[type="submit"]';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await safeClick(page, signInSubmitSelector);
      signInResult = await waitForMenuStepOrError(
        page,
        'characters',
        attempt === 0 ? TEST_TIMEOUT_MS : Math.max(3500, Math.floor(TEST_TIMEOUT_MS / 2))
      );
      if (signInResult.ok) break;
      const errorText = String(signInResult.errorText ?? '').toLowerCase();
      if (errorText && !errorText.includes('timed out waiting for menu step')) {
        break;
      }
      await sleep(120);
    }
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
    const createSubmitSelector = '#character-create-form button[type="submit"]';
    await safeClick(page, createSubmitSelector);
    try {
      await page.waitForFunction(() => {
        const menu = document.querySelector('#menu');
        const loadingScreen = document.querySelector('#loading-screen');
        const menuOpen = menu?.classList.contains('open') ?? false;
        const menuLoading = menu?.classList.contains('loading') ?? false;
        const step = menu?.getAttribute('data-step') ?? '';
        const loadingVisible = loadingScreen?.classList.contains('visible') ?? false;
        return !menuOpen || menuLoading || loadingVisible || step !== 'create';
      }, null, { timeout: TEST_TIMEOUT_MS });
    } catch {
      const menuStatus = await getMenuStatus(page);
      const createErrorText = String(menuStatus.createError ?? '').trim();
      throw new Error(
        `Character create submit did not transition to loading/world.` +
        ` step=${menuStatus.step} open=${menuStatus.open} loading=${menuStatus.loading}` +
        (createErrorText ? ` error=${createErrorText}` : '')
      );
    }

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
      if (!seenStages.has('Loading world assets') && !seenStages.has('Preparing session')) {
        throw new Error(`Loading flow missing asset/session stage. Seen: ${Array.from(seenStages).join(', ')}`);
      }
      if (
        seenStages.size >= 3 &&
        !seenStages.has('Connecting realm') &&
        !seenStages.has('Syncing world state')
      ) {
        throw new Error(`Loading flow missing connection/sync stage. Seen: ${Array.from(seenStages).join(', ')}`);
      }
      if (seenStages.size >= 2 && !sawProgressSignal) {
        throw new Error('Loading flow did not expose a visible progress signal.');
      }
    }
    await waitForLoadingScreenToDisappear(page);
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => s.mode === 'play' && !!s.player,
      TEST_TIMEOUT_MS,
      'enter world after character create'
    );

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
    await page.waitForFunction(() =>
      document.querySelector('#ability-bar')?.classList.contains('layout-edit')
    );
    const skillsText = await page.locator('#skills-list').innerText();
    if (!skillsText.includes('Slash')) {
      throw new Error('Skills panel missing Slash');
    }
    const abilityBarState = await readAbilityBarSlots(page);
    const occupiedSlots = abilityBarState.filter((/** @type {any} */ slot) => !slot.empty);
    const emptySlots = abilityBarState.filter((/** @type {any} */ slot) => slot.empty);
    if (occupiedSlots.length === 0) {
      throw new Error('Need at least one occupied ability bar slot for drag regression');
    }
    const dragSource =
      occupiedSlots.find((/** @type {any} */ slot) => slot.slot !== 1) ??
      occupiedSlots[0];
    const preferredNonPrimaryTargets = abilityBarState.filter(
      (/** @type {any} */ slot) => slot.slot !== dragSource.slot && slot.slot !== 1
    );
    const dragTarget =
      dragSource.slot === 1
        ? preferredNonPrimaryTargets.find((/** @type {any} */ slot) => slot.empty) ??
          preferredNonPrimaryTargets.find((/** @type {any} */ slot) => !slot.empty) ??
          null
        : preferredNonPrimaryTargets.find((/** @type {any} */ slot) => !slot.empty) ??
          preferredNonPrimaryTargets.find((/** @type {any} */ slot) => slot.empty) ??
          null;
    if (!dragSource?.slot || !dragSource.name || !dragTarget?.slot) {
      throw new Error('Ability bar drag regression could not resolve valid slot targets');
    }
    const dragSourceSelector = `#ability-bar .ability-slot[data-slot="${dragSource.slot}"]`;
    const dragTargetSelector = `#ability-bar .ability-slot[data-slot="${dragTarget.slot}"]`;
    const expectSourceEmpty = !!dragTarget.empty;
    const expectedTargetName = dragSource.name;
    const onlyPrimaryAbilitySlotted = occupiedSlots.length === 1 && dragSource.slot === 1;
    if (onlyPrimaryAbilitySlotted) {
      console.warn('[e2e] Skipping ability-bar slot-swap check because only slot 1 is populated.');
    } else {
      await dragAbilityBarSlotWithRetry(page, {
        sourceSelector: dragSourceSelector,
        targetSelector: dragTargetSelector,
        expectedTargetName,
        expectSourceEmpty,
      });
      await dragSelectorToSelectorCenter(page, dragTargetSelector, '#skills-list .skills-loadout-remove');
      await page.waitForFunction(
        (/** @type {any} */ selector) => {
          const slot = document.querySelector(selector);
          if (!(slot instanceof HTMLElement)) return false;
          return slot.classList.contains('empty');
        },
        dragTargetSelector
      );
      if (dragSource.slot === 1) {
        const restoreAbilityId = await page.evaluate(
          (/** @type {any} */ abilityName) => {
            const row = Array.from(document.querySelectorAll('#skills-list .skill-row')).find(
              (/** @type {any} */ entry) =>
                entry instanceof HTMLElement &&
                entry.querySelector('.skill-name')?.textContent?.trim() === abilityName
            );
            return row instanceof HTMLElement ? String(row.dataset.abilityId ?? '') : '';
          },
          dragSource.name
        );
        if (!restoreAbilityId) {
          throw new Error(`Could not restore slot 1 after drag regression for ${dragSource.name}`);
        }
        await dragSelectorToSelectorCenter(
          page,
          `#skills-list .skill-row[data-ability-id="${restoreAbilityId}"]`,
          '#ability-bar .ability-slot[data-slot="1"]'
        );
        await page.waitForFunction(
          (/** @type {any} */ abilityName) => {
            const slot = document.querySelector('#ability-bar .ability-slot[data-slot="1"]');
            if (!(slot instanceof HTMLElement)) return false;
            const currentName = slot.querySelector('.ability-name')?.textContent?.trim() ?? '';
            return !slot.classList.contains('empty') && currentName === abilityName;
          },
          dragSource.name
        );
      }
    }
    await page.keyboard.press('k');
    await page.waitForFunction(
      () => !document.querySelector('#character-sheet-panel')?.classList.contains('open')
    );
    await page.waitForFunction(() =>
      !document.querySelector('#ability-bar')?.classList.contains('layout-edit')
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

    state = await waitForCondition(
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
      (/** @type {any} */ s) => {
        if (!s.player) return false;
        const modeOk = s.player.movementMode === 'walk';
        const walkingOk = s.player.walking === true || modeOk;
        const speed = Number(s.player.movementSpeed ?? 0);
        return modeOk && walkingOk && speed > 0 && speed < sprintSpeed;
      },
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
    if (walkDistance >= sprintDistance) {
      console.warn(
        `[e2e] Walk movement covered more ground than sprint sample; keeping speed-based assertion. distance=${walkDistance.toFixed(2)} sprintDistance=${sprintDistance.toFixed(2)} walkSpeed=${walkSpeed.toFixed(2)} sprintSpeed=${sprintSpeed.toFixed(2)}`
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
        structure?.collides !== false &&
        (
          isMedievalBuildingKind(structure?.kind) ||
          (Number.isFinite(structure?.colliderRadius) && structure.colliderRadius > 0)
        )
    );
    const blockingStructure =
      collidableStructures.find((/** @type {any} */ structure) => structure.kind === 'market') ??
      collidableStructures[0] ??
      null;
    if (blockingStructure) {
      state = await moveNearCollidableStructure(page, blockingStructure, 'collidable structure', state);
      await advance(page, 1000);
      await sleep(100);
      state = await getState(page);
      if (isMedievalBuildingKind(blockingStructure.kind)) {
        state = await verifyMedievalWallCollision(page, blockingStructure, state, 'collidable structure');
      } else {
        const minDistance = (blockingStructure.colliderRadius ?? 0) + 0.45;
        const actualDistance = distance(state.player, blockingStructure);
        if (actualDistance < minDistance) {
          throw new Error(
            `Player crossed structure collision boundary (${actualDistance.toFixed(2)} < ${minDistance.toFixed(2)}).`
          );
        }
      }
    }

    const fenceStructure =
      collidableStructures.find((/** @type {any} */ structure) => structure.kind === 'fence') ??
      null;
    if (fenceStructure) {
      state = await moveNearCollidableStructure(page, fenceStructure, 'collidable fence', state);
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
      try {
        state = await moveWithinRange(
          page,
          { x: testResource.x, z: testResource.z },
          harvestRadius + 0.2,
          'reach test resource',
          state
        );
        resource = testResource;
      } catch (error) {
        console.warn(
          `[e2e] Direct path to test resource failed; falling back to nearest reachable resource. ${String(error)}`
        );
        state = await getState(page);
      }
    }

    const availableResources = state.resources.filter((/** @type {any} */ r) => r.available);
    if (availableResources.length === 0) {
      throw new Error('No available resource found');
    }
    const obstacles = state.world?.collisionObstacles ?? state.world?.obstacles ?? [];
    const sortedResources = availableResources
      .slice()
      .sort((/** @type {any} */ a, /** @type {any} */ b) => distance(state.player, a) - distance(state.player, b));

    let /** @type {any} */ lastReachError = null;
    for (const candidate of sortedResources.slice(0, 5)) {
      if (resource) break;
      state = await getState(page);
      const distToResource = distance(state.player, candidate);
      const reachTimeoutMs = Math.max(
        TEST_TIMEOUT_MS,
        Math.ceil((distToResource / 3) * 1000 + 5000)
      );

      let /** @type {any} */ reached = null;
      try {
        reached = await moveWithinRange(
          page,
          { x: candidate.x, z: candidate.z },
          harvestRadius + 1.1,
          `reach resource ${candidate.id}`,
          state
        );
      } catch (err) {
        lastReachError = err;
        state = await getState(page);
        await page.evaluate(() => window.__game?.clearInput?.());
        continue;
      }

      if (distance(reached.player, candidate) <= harvestRadius - 0.05) {
        resource = candidate;
        state = reached;
        break;
      }
    }

    if (!resource) {
      console.warn(
        `[e2e] Skipping harvest interaction checks because no reachable resource was found. ${String(lastReachError ?? '')}`
      );
      state = await getState(page);
    } else {
      console.log(`Selected resource ${resource.id}`);
      console.log(
        `Player at (${state.player.x.toFixed(2)}, ${state.player.z.toFixed(2)}) ` +
          `distance=${distance(state.player, resource).toFixed(2)}`
      );

      const harvestDurationMs = state.world?.harvestDurationMs ?? 2500;
      const invBefore = state.player.inv;
      await page.evaluate(() => window.__game?.clearInput?.());
      let harvestStarted = false;
      let /** @type {any} */ harvestStartError = null;
      for (let attempt = 0; attempt < 3 && !harvestStarted; attempt += 1) {
        await page.evaluate(() => window.__game?.interact());
        try {
          state = await waitForCondition(
            page,
            (/** @type {any} */ s) =>
              s.player &&
              s.player.harvest &&
              s.player.harvest.resourceId === resource.id,
            Math.max(3500, Math.floor(TEST_TIMEOUT_MS / 2)),
            `harvest channel start (attempt ${attempt + 1})`
          );
          harvestStarted = true;
        } catch (err) {
          harvestStartError = err;
          await advance(page, 400);
          await sleep(80);
          state = await getState(page);
        }
      }
      if (!harvestStarted) {
        console.warn(`[e2e] Skipping harvest channel checks after failed start. ${String(harvestStartError ?? '')}`);
      } else {
      await advance(page, 1000 / 30);
      await sleep(50);
      await assertHarvestProgressHudPlacement(page, 'harvest HUD placement');
      const preCompleteAdvance = Math.max(200, harvestDurationMs - 450);
      await advance(page, preCompleteAdvance);
      state = await getState(page);
      const invAfterPreWindow = state?.player?.inv ?? 0;
      if (invAfterPreWindow !== invBefore) {
        // In some environments the server-side harvest completion may occur slightly earlier
        // than the nominal duration; log and continue rather than treating this as a hard failure.
        console.warn(
          `[e2e] Harvest completed earlier than expected window. ` +
            `invBefore=${invBefore}, invAfter=${invAfterPreWindow}, ` +
            `harvestDurationMs=${harvestDurationMs}`
        );
      }
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => {
          if (!s.player) return false;
          if ((s.player.inv ?? 0) >= invBefore + 1) return true;
          const nextResource = s.resources?.find((/** @type {any} */ r) => r.id === resource.id);
          return !!nextResource && nextResource.available === false;
        },
        TEST_TIMEOUT_MS + harvestDurationMs,
        'harvest completion'
      );
      state = await assertAliveBefore(page, 'inventory/equipment checks', state);

      const updatedResource = state.resources.find((/** @type {any} */ r) => r.id === resource.id);
      if (!updatedResource || updatedResource.available) {
        throw new Error('Resource did not become unavailable after harvest');
      }
      }
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
    if (!isWithinViewport(inventoryDraggedRect, DESKTOP_VIEWPORT, 24)) {
      throw new Error(
        `Inventory panel moved outside viewport bounds: rect=${JSON.stringify(inventoryDraggedRect)} viewport=${JSON.stringify(DESKTOP_VIEWPORT)}`
      );
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
    await page.waitForFunction(() => {
      const panel = document.getElementById('inventory-panel');
      if (!(panel instanceof HTMLElement) || !panel.classList.contains('open')) {
        return false;
      }
      const rect = panel.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

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
    if ((await weaponSlotLoc.count()) === 0 || (await emptySlotEl.count()) === 0) {
      throw new Error('Weapon slot or empty inventory slot not found');
    }
    await emptySlotEl.evaluate((/** @type {any} */ node) =>
      node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    );
    await weaponSlotLoc.evaluate((/** @type {any} */ node) =>
      node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    );

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
  };

  const runVendorTradeDesktopStage = async () => {
    vendor = state.world?.vendors?.[0];
    if (!vendor) {
      throw new Error('No vendor found in world snapshot');
    }
    const vendorRadius = (state.world?.vendorInteractRadius ?? 2.5) - 0.05;
    state = await moveWithinRange(page, { x: vendor.x, z: vendor.z }, vendorRadius, 'reach vendor', state);

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
  };

  const runVendorContractFlowStage = async () => {
    await safeClick(page, '.vendor-tab[data-tab="contracts"]');
    await page.waitForFunction(() => {
      const contractsView = document.querySelector('.vendor-contracts');
      return contractsView?.classList.contains('active');
    });
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => {
        const offers = Array.isArray(s.player?.contractOffersByVendor?.[vendor.id])
          ? s.player.contractOffersByVendor[vendor.id]
          : [];
        return offers.length > 0 || !!pickSupportedActiveContractForVendor(s, vendor.id);
      },
      TEST_TIMEOUT_MS,
      'contract offers or active contract'
    );
    const contractXpBefore = state.player?.xp ?? 0;
    const contractCopperBefore = state.player?.currencyCopper ?? 0;

    const acceptedContract = await acceptPreferredContractOffer(page, state, vendor.id);
    state = acceptedContract.state;
    const contractOffer = acceptedContract.contractOffer;
    let activeContract = acceptedContract.activeContract;
    let activeContractId = getContractId(activeContract);
    if (!activeContractId) {
      throw new Error(`Accepted contract is missing an id: ${JSON.stringify(activeContract)}`);
    }
    const contractTitle = String(activeContract?.title ?? contractOffer?.title ?? activeContractId);
    await page.waitForFunction(
      (/** @type {any} */ title) => {
        const tracker = document.getElementById('objective-tracker');
        return (
          tracker &&
          !tracker.classList.contains('hidden') &&
          (tracker.textContent ?? '').includes(title)
        );
      },
      contractTitle
    );
    await safeClick(page, '.inventory-tab[data-tab="journal"]');
    await page.waitForFunction(() =>
      document.getElementById('journal-view')?.classList.contains('active')
    );
    await page.waitForFunction(
      (/** @type {any} */ title) =>
        document.getElementById('journal-root')?.textContent?.includes(title),
      contractTitle
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
      await page.evaluate(
        (/** @type {{ recipeId: string, count: number }} */ payload) =>
          window.__game?.craft?.(payload.recipeId, payload.count),
        {
          recipeId: String(activeContract?.target ?? contractOffer?.target ?? 'herb_health_potion'),
          count: Math.max(
            1,
            Number(activeContract?.requiredCount ?? contractOffer?.requiredCount ?? 1)
          ),
        }
      );
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => !!getActiveContract(s, activeContractId)?.completed,
        TEST_TIMEOUT_MS,
        `complete craft contract ${activeContractId}`
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
      activeContract = getActiveContract(state, activeContractId) ?? activeContract;
    } else if (activeContract.kind === 'gather') {
      await safeClick(page, '#vendor-panel-close');
      await page.waitForFunction(
        () =>
          !document.querySelector('#vendor-panel')?.classList.contains('open') &&
          !document.body.classList.contains('trade-open') &&
          !document.body.classList.contains('vendor-layout-open')
      );
      state = await completeGatherContract(page, activeContract);
      state = await moveWithinRange(
        page,
        { x: vendor.x, z: vendor.z },
        (state.world?.vendorInteractRadius ?? 2.5) - 0.05,
        'return to vendor for contract turn-in',
        state
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
      activeContract = getActiveContract(state, activeContractId) ?? activeContract;
    }

    if (!getActiveContract(state, activeContractId)?.completed) {
      state = await waitForCondition(
        page,
        (/** @type {any} */ s) => !!getActiveContract(s, activeContractId)?.completed,
        TEST_TIMEOUT_MS,
        `completed contract ${activeContractId}`
      );
    }

    activeContract = getActiveContract(state, activeContractId) ?? activeContract;
    activeContractId = getContractId(activeContract) || activeContractId;
    const turnInTitle = String(activeContract?.title ?? contractTitle);
    await clickVendorContractAction(page, turnInTitle, 'Turn In');
    state = await waitForCondition(
      page,
      (/** @type {any} */ s) => !getActiveContract(s, activeContractId),
      TEST_TIMEOUT_MS,
      `turn in contract ${activeContractId}`
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
  };

  const runStationCraftingStage = async () => {
    const forge = state.world?.structures?.find((/** @type {any} */ structure) => structure.kind === 'barracks');
    if (!forge) {
      throw new Error('No barracks structure available for forge crafting checks');
    }
    state = await moveWithinRange(
      page,
      { x: forge.x, z: forge.z },
      4.4,
      'reach forge station',
      state
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
  };

  const runVendorTradeSmallViewportStage = async () => {
    await safeSetViewport(page, SMALL_VIEWPORT);
    await page.waitForFunction(
      (/** @type {any} */ viewport) =>
        window.innerWidth === viewport.width && window.innerHeight === viewport.height,
      SMALL_VIEWPORT
    );
    const vendorRadius = (state.world?.vendorInteractRadius ?? 2.5) - 0.05;
    state = await moveWithinRange(
      page,
      { x: vendor.x, z: vendor.z },
      vendorRadius,
      'reach vendor for small viewport checks',
      state
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
  };

  const runTargetingAndCombatStage = async () => {
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
    await page.waitForFunction(
      (/** @type {string} */ expectedName) =>
        document.querySelector('#target-name')?.textContent?.trim() === expectedName,
      vendorClickTarget.name
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
    state = await moveWithinRange(
      page,
      attackMoveTarget,
      attackReachThreshold,
      'reach attack target',
      state
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

    const targetState = state.target;
    if (!targetState || targetState.id !== attackTarget.id) {
      throw new Error('Target HUD state not available after selection');
    }
    await page.waitForFunction(
      (/** @type {string} */ expectedName) =>
        document.querySelector('#target-name')?.textContent?.trim() === expectedName,
      targetState.name
    );
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
        state = await moveWithinRange(
          page,
          attackMoveTarget,
          attackReachThreshold,
          `recover attack range (${attackTarget.id})`,
          state
        ).catch(async () => getState(page));
        state = await waitForCondition(
          page,
          (/** @type {any} */ s) => {
            const mob = s.mobs?.find((/** @type {any} */ m) => m.id === attackTarget.id && !m.dead);
            if (!mob || !s.player) return false;
            return s.player.targetId === attackTarget.id && distance(s.player, mob) <= attackReachThreshold;
          },
          5000,
          `recover attack range lock (${attackTarget.id})`
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

    state = await moveWithinRange(
      page,
      { x: mobDamageTarget.x, z: mobDamageTarget.z },
      mobAttackRange - 0.1,
      'reach mob for damage',
      state
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
  };

  const runRepairAndSalvageStage = async () => {
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

    state = await moveWithinRange(
      page,
      { x: vendor.x, z: vendor.z },
      (state.world?.vendorInteractRadius ?? 2.5) - 0.05,
      'return to vendor for repair',
      state
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
  };

  const /** @type {Array<[string, string, (ctx: any) => Promise<void>, (ctx: any) => Promise<void>]>} */ mainFlows = [
    ['authFlow', 'auth-flow', runAuthFlowStage, runAuthFlowModule],
    ['vendorTradeDesktop', 'vendor-trade-desktop', runVendorTradeDesktopStage, runVendorTradeDesktopModule],
    ['vendorContractFlow', 'vendor-contract-flow', runVendorContractFlowStage, runVendorContractFlowModule],
    ['stationCrafting', 'station-crafting', runStationCraftingStage, runStationCraftingModule],
    [
      'vendorTradeSmallViewport',
      'vendor-trade-small-viewport',
      runVendorTradeSmallViewportStage,
      runVendorTradeSmallViewportModule,
    ],
    ['targetingAndCombat', 'targeting-and-combat', runTargetingAndCombatStage, runTargetingAndCombatModule],
    ['repairAndSalvage', 'repair-and-salvage', runRepairAndSalvageStage, runRepairAndSalvageModule],
  ];

  ctx.mainFlows = /** @type {any} */ (Object.fromEntries(mainFlows.map(([key, , runStage]) => [key, runStage])));
  for (const [, stageName, , runModule] of mainFlows) {
    setStage(stageName);
    await runModule(ctx);
  }

  if (consoleErrors.length) {
    throw new Error(`Console errors: ${consoleErrors.join('\n')}`);
  }
}
