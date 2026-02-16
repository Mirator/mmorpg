import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_CSS = path.resolve(process.cwd(), 'client/style/chat.css');
const VENDOR_CSS = path.resolve(process.cwd(), 'client/style/vendor.css');

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
});
