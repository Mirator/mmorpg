import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_CSS = path.resolve(process.cwd(), 'client/style/chat.css');
const VENDOR_CSS = path.resolve(process.cwd(), 'client/style/vendor.css');
const BASE_CSS = path.resolve(process.cwd(), 'client/style/base.css');
const MENU_CSS = path.resolve(process.cwd(), 'client/style/menu.css');
const OVERLAY_CSS = path.resolve(process.cwd(), 'client/style/overlay.css');
const PANELS_CSS = path.resolve(process.cwd(), 'client/style/panels.css');
const TOAST_CSS = path.resolve(process.cwd(), 'client/style/toast.css');
const LAYOUT_CSS = path.resolve(process.cwd(), 'client/style/layout.css');
const ADMIN_STYLE_CSS = path.resolve(process.cwd(), 'admin/style.css');
const ADMIN_DASHBOARD_CSS = path.resolve(process.cwd(), 'admin/dashboard.css');
const ADMIN_MAP_CSS = path.resolve(process.cwd(), 'admin/map.css');
const ADMIN_MODULE_CSS = path.resolve(process.cwd(), 'admin/module.css');
const ADMIN_MAP_JS = path.resolve(process.cwd(), 'admin/map.js');
const ADMIN_NAV_JS = path.resolve(process.cwd(), 'admin/nav.js');
const ADMIN_PATCHES_JS = path.resolve(process.cwd(), 'admin/patches.js');
const ADMIN_EVENTS_JS = path.resolve(process.cwd(), 'admin/events.js');
const ADMIN_COLLAB_JS = path.resolve(process.cwd(), 'admin/collab.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

describe('style scope integrity', () => {
  it('keeps vendor selectors out of chat.css', () => {
    const chatCss = read(CHAT_CSS);
    expect(chatCss).not.toMatch(/\.(vendor-[\w-]+)\s*[{,]/);
    expect(chatCss).not.toMatch(/#vendor-[\w-]+\s*[{,]/);
  });

  it('keeps chat and party selectors out of vendor.css', () => {
    const vendorCss = read(VENDOR_CSS);
    expect(vendorCss).not.toMatch(/\.(chat-[\w-]+)\s*[{,]/);
    expect(vendorCss).not.toMatch(/#chat-[\w-]+\s*[{,]/);
    expect(vendorCss).not.toMatch(/\.(party-[\w-]+)\s*[{,]/);
  });

  it('contains required vendor interaction selectors', () => {
    const vendorCss = read(VENDOR_CSS);
    for (const selector of [
      '.vendor-tab',
      '.vendor-view',
      '.vendor-buy',
      '.vendor-sell',
      '.vendor-dropzone',
      '.vendor-buy-items',
      '.vendor-prices',
    ]) {
      expect(vendorCss).toContain(selector);
    }
  });

  it('contains fantasy palette tokens and accessibility primitives', () => {
    const baseCss = read(BASE_CSS);
    for (const token of [
      '--bg: #12100b',
      '--accent: #c89b3c',
      '--accent-2: #6f9f62',
      '--danger: #c8614f',
      '--success: #88bf73',
      '--accent-rgb: 200, 155, 60',
      '--accent-2-rgb: 111, 159, 98',
      '--motion-base',
      '--focus-ring',
    ]) {
      expect(baseCss).toContain(token);
    }
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('contains menu flow selectors for progress and smart continue', () => {
    const menuCss = read(MENU_CSS);
    for (const selector of [
      '.menu-shell',
      '.menu-title-plaque',
      '.menu-nav-list',
      '.menu-progress',
      '.menu-status',
      '.menu-continue',
      '.character-class-preview',
      '.menu-info-board',
      '.menu-footer',
      '.menu-overlay-panel',
    ]) {
      expect(menuCss).toContain(selector);
    }
  });

  it('contains loading and entry presentation selectors', () => {
    const overlayCss = read(OVERLAY_CSS);
    for (const selector of ['.loading-stage', '.loading-tip', '.loading-progress-bar.indeterminate', '.entry-banner']) {
      expect(overlayCss).toContain(selector);
    }
  });

  it('anchors cast progress near abilities and shifts prompt while active', () => {
    const overlayCss = read(OVERLAY_CSS);
    expect(overlayCss).toMatch(
      /\.cast-bar-wrap\s*\{[\s\S]*position:\s*fixed;[\s\S]*left:\s*50%;[\s\S]*bottom:\s*\d+px;[\s\S]*transform:\s*translateX\(-50%\);[\s\S]*pointer-events:\s*none;/
    );
    expect(overlayCss).toMatch(/body\.cast-bar-active\s+#prompt\s*\{[\s\S]*bottom:\s*\d+px;/);
  });

  it('lets ability bar tooltips render outside the slot bounds', () => {
    const panelsCss = read(PANELS_CSS);
    expect(panelsCss).toMatch(
      /\.ability-slot\s*\{[\s\S]*overflow:\s*visible;/
    );
    expect(panelsCss).toMatch(
      /\.ability-slot::after\s*\{[\s\S]*border-radius:\s*inherit;/
    );
    expect(panelsCss).toMatch(
      /\.ability-tooltip\s*\{[\s\S]*width:\s*min\(260px,\s*calc\(100vw - 48px\)\);/
    );
  });

  it('keeps ability icons above cooldown overlays', () => {
    const panelsCss = read(PANELS_CSS);
    expect(panelsCss).toMatch(
      /\.ability-slot::after\s*\{[\s\S]*z-index:\s*1;/
    );
    expect(panelsCss).toMatch(
      /\.ability-slot\.unusable:not\(\.empty\)::before\s*\{[\s\S]*z-index:\s*1;/
    );
    expect(panelsCss).toMatch(
      /\.ability-icon\s*\{[\s\S]*z-index:\s*2;/
    );
    expect(panelsCss).toMatch(
      /\.ability-key\s*\{[\s\S]*z-index:\s*3;/
    );
    expect(panelsCss).toMatch(
      /\.ability-cooldown-num\s*\{[\s\S]*z-index:\s*3;/
    );
  });

  it('keeps modal layout independent of body state panel-shift classes', () => {
    const layoutCss = read(LAYOUT_CSS);
    expect(layoutCss).not.toMatch(/body\.trade-open\s+#inventory-panel/);
    expect(layoutCss).not.toMatch(/body\.trade-open\s+#vendor-panel/);
    expect(layoutCss).not.toMatch(/body\.player-trade-open\s+#inventory-panel/);
    expect(layoutCss).not.toMatch(/body\.inventory-open\.character-open\s+#character-sheet-panel/);
    expect(layoutCss).not.toMatch(/body\.inventory-open\.character-open\s+#inventory-panel/);
  });

  it('does not contain legacy sci-fi signature colors in primary style files', () => {
    const styles = [BASE_CSS, MENU_CSS, OVERLAY_CSS, PANELS_CSS, VENDOR_CSS, CHAT_CSS, TOAST_CSS]
      .map(read)
      .join('\n');
    expect(styles).not.toMatch(/rgba\(\s*77\s*,\s*163\s*,\s*255/i);
    expect(styles).not.toMatch(/rgba\(\s*94\s*,\s*242\s*,\s*194/i);
    expect(styles).not.toMatch(/#4da3ff/i);
    expect(styles).not.toMatch(/#5ef2c2/i);
  });

  it('keeps admin UI on the fantasy palette and removes legacy sci-fi signatures', () => {
    const adminStyleCss = read(ADMIN_STYLE_CSS);
    for (const token of ['--bg: #12100b', '--accent: #c89b3c', '--accent-2: #6f9f62']) {
      expect(adminStyleCss).toContain(token);
    }

    const adminUi = [
      ADMIN_STYLE_CSS,
      ADMIN_DASHBOARD_CSS,
      ADMIN_MAP_CSS,
      ADMIN_MODULE_CSS,
      ADMIN_MAP_JS,
      ADMIN_NAV_JS,
      ADMIN_PATCHES_JS,
      ADMIN_EVENTS_JS,
      ADMIN_COLLAB_JS,
    ]
      .map(read)
      .join('\n');

    expect(adminUi).not.toMatch(/rgba\(\s*95\s*,\s*184\s*,\s*255/i);
    expect(adminUi).not.toMatch(/rgba\(\s*94\s*,\s*242\s*,\s*194/i);
    expect(adminUi).not.toMatch(/#5fb8ff/i);
    expect(adminUi).not.toMatch(/#5ef2c2/i);
    expect(adminUi).not.toMatch(/#0f1820/i);
  });
});
