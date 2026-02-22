import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_CSS = path.resolve(process.cwd(), 'client/style/chat.css');
const VENDOR_CSS = path.resolve(process.cwd(), 'client/style/vendor.css');
const BASE_CSS = path.resolve(process.cwd(), 'client/style/base.css');
const MENU_CSS = path.resolve(process.cwd(), 'client/style/menu.css');
const OVERLAY_CSS = path.resolve(process.cwd(), 'client/style/overlay.css');

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

  it('contains base design token and accessibility primitives', () => {
    const baseCss = read(BASE_CSS);
    for (const token of ['--surface-1', '--surface-2', '--motion-base', '--focus-ring']) {
      expect(baseCss).toContain(token);
    }
    expect(baseCss).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('contains menu flow selectors for progress and smart continue', () => {
    const menuCss = read(MENU_CSS);
    for (const selector of ['.menu-progress', '.menu-status', '.menu-continue', '.character-class-preview']) {
      expect(menuCss).toContain(selector);
    }
  });

  it('contains loading and entry presentation selectors', () => {
    const overlayCss = read(OVERLAY_CSS);
    for (const selector of ['.loading-stage', '.loading-tip', '.loading-progress-bar.indeterminate', '.entry-banner']) {
      expect(overlayCss).toContain(selector);
    }
  });
});
