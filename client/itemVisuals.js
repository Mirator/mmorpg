// @ts-check
import { getItemIconFile } from './gameIcons.js';
import { createGlyphElement, createVisuallyHiddenText } from './uiGlyphs.js';

function makeItemLabel(/** @type {any} */ item) {
  const name = item?.name || item?.kind || 'Item';
  return name.slice(0, 1).toUpperCase();
}

function renderFallbackGlyph(
  /** @type {HTMLElement} */ container,
  /** @type {any} */ item,
  /** @type {any} */ label,
  /** @type {any} */ glyphClassName
) {
  const iconFile = getItemIconFile(item?.kind);
  if (!iconFile) {
    container.textContent = makeItemLabel(item);
    return;
  }
  container.appendChild(
    createGlyphElement(iconFile, {
      className: glyphClassName,
      label,
    })
  );
  container.appendChild(createVisuallyHiddenText(label));
}

function renderThumbnail(
  /** @type {HTMLElement} */ container,
  /** @type {any} */ dataUrl,
  /** @type {any} */ label,
  /** @type {any} */ thumbClassName
) {
  const img = document.createElement('img');
  img.className = thumbClassName;
  img.src = dataUrl;
  img.alt = label;
  img.loading = 'lazy';
  container.innerHTML = '';
  container.appendChild(img);
}

/**
 * Renders item visual into a container using glyph fallback and async static thumbnail replacement.
 * @param {HTMLElement} container
 * @param {{
 *   item: any,
 *   label?: string,
 *   glyphClassName: string,
 *   thumbClassName: string,
 *   previewResolver?: { getCached?: (kind: string) => string | null | undefined, resolveItemPreviewKind?: (kind: string) => Promise<string | null> } | null,
 * }} opts
 */
export function populateItemVisual(container, opts) {
  const item = opts?.item ?? null;
  const kind = typeof item?.kind === 'string' ? item.kind : '';
  const label = opts?.label ?? item?.name ?? kind ?? 'Item';
  container.innerHTML = '';
  renderFallbackGlyph(container, item, label, opts?.glyphClassName ?? 'ui-glyph ui-glyph-lg');
  const resolver = opts?.previewResolver;
  if (!resolver || !kind) return;
  const cached = resolver.getCached?.(kind);
  if (typeof cached === 'string' && cached.length > 0) {
    renderThumbnail(container, cached, label, opts?.thumbClassName ?? 'item-thumb');
    return;
  }
  if (cached === null) return;
  if (typeof resolver.resolveItemPreviewKind !== 'function') return;
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  container.dataset.previewToken = token;
  resolver.resolveItemPreviewKind(kind).then((dataUrl) => {
    if (container.dataset.previewToken !== token) return;
    if (!dataUrl) return;
    renderThumbnail(container, dataUrl, label, opts?.thumbClassName ?? 'item-thumb');
  });
}
