import { TEST_TIMEOUT_MS, sleep } from '../helpers.js';

function rectanglesOverlap(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isClickableInViewport(rect, viewport) {
  if (!rect || !viewport) return false;
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.left < 0 || rect.top < 0) return false;
  if (rect.right > viewport.width || rect.bottom > viewport.height) return false;
  return true;
}

function isWithinViewport(rect, viewport, tolerance = 0) {
  if (!rect || !viewport) return false;
  return (
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance
  );
}

async function readVendorMetrics(page) {
  return page.evaluate(() => {
    function readBounds(selector) {
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

    const tabs = Array.from(document.querySelectorAll('.vendor-tab')).map((tab) => {
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
      panel: readBounds('#vendor-panel'),
      closeButton: readBounds('#vendor-panel-close'),
      tabs,
    };
  });
}

async function readHudProgressMetrics(page) {
  return page.evaluate(() => {
    function readBounds(selector) {
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

export async function assertHarvestProgressHudPlacement(page, label) {
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

export async function assertVendorControlsInViewport(page, label) {
  const metrics = await readVendorMetrics(page);
  const buyTab = metrics.tabs.find((tab) => tab.tab === 'buy') ?? null;
  const sellTab = metrics.tabs.find((tab) => tab.tab === 'sell') ?? null;

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

export async function assertVendorTradePanelsSeparated(page, label) {
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

export async function waitForVendorTradeLayoutStable(page) {
  await page.waitForFunction(() => {
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

export async function readPanelRect(page, selector) {
  return page.evaluate((sel) => {
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

export async function dragPanelBy(page, handleSelector, dx, dy) {
  await page.waitForSelector(handleSelector, { state: 'visible' });
  await page.evaluate(
    (payload) => {
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

export async function dragSelectorToSelectorCenter(page, sourceSelector, targetSelector) {
  await page.waitForSelector(sourceSelector, { state: 'visible' });
  await page.waitForSelector(targetSelector, { state: 'visible' });
  await page.evaluate(
    (payload) => {
      const source = document.querySelector(payload.sourceSelector);
      const target = document.querySelector(payload.targetSelector);
      if (!(source instanceof HTMLElement)) {
        throw new Error(`Drag source not visible: ${payload.sourceSelector}`);
      }
      if (!(target instanceof HTMLElement)) {
        throw new Error(`Drag target not visible: ${payload.targetSelector}`);
      }
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const startX = sourceRect.left + sourceRect.width / 2;
      const startY = sourceRect.top + sourceRect.height / 2;
      const endX = targetRect.left + targetRect.width / 2;
      const endY = targetRect.top + targetRect.height / 2;
      const pointerId = 1;
      const steps = 12;
      source.dispatchEvent(
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
        const nextX = startX + ((endX - startX) * i) / steps;
        const nextY = startY + ((endY - startY) * i) / steps;
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
          clientX: endX,
          clientY: endY,
        })
      );
    },
    { sourceSelector, targetSelector }
  );
  await sleep(80);
}

export function assertRectNear(a, b, tolerancePx, label) {
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

export async function safeSetViewport(page, viewport) {
  try {
    await page.setViewportSize(viewport);
    return;
  } catch (err) {
    const message = String(err?.message ?? err);
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

export { isClickableInViewport, isWithinViewport };
