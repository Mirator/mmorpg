// @ts-check
import { getGameIconUrl } from './gameIcons.js';

export function applyGlyphMask(/** @type {HTMLElement | null | undefined} */ el, /** @type {any} */ iconFile) {
  if (!el) return;
  if (!iconFile) {
    el.style.setProperty('--ui-glyph-mask', 'none');
    return;
  }
  el.style.setProperty('--ui-glyph-mask', `url("${getGameIconUrl(iconFile)}")`);
}

export function createGlyphElement(/** @type {any} */ iconFile, /** @type {any} */ opts = {}) {
  const el = document.createElement('div');
  const baseClass = opts.className || 'ui-glyph ui-glyph-md';
  el.className = opts.muted ? `${baseClass} muted` : baseClass;
  applyGlyphMask(el, iconFile);
  if (opts.label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', String(opts.label));
  }
  return el;
}

export function createVisuallyHiddenText(/** @type {any} */ text) {
  const el = document.createElement('span');
  el.className = 'visually-hidden';
  el.textContent = String(text ?? '');
  return el;
}
