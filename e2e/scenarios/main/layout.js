// @ts-check

export function sanitizeToken(/** @type {any} */ value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return normalized || 'run';
}

export function rectanglesOverlap(/** @type {any} */ a, /** @type {any} */ b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function isClickableInViewport(/** @type {any} */ rect, /** @type {any} */ viewport) {
  if (!rect || !viewport) return false;
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.left < 0 || rect.top < 0) return false;
  if (rect.right > viewport.width || rect.bottom > viewport.height) return false;
  return true;
}

export function isWithinViewport(
  /** @type {any} */ rect,
  /** @type {any} */ viewport,
  /** @type {any} */ tolerance = 0
) {
  if (!rect || !viewport) return false;
  return (
    rect.left >= -tolerance &&
    rect.top >= -tolerance &&
    rect.right <= viewport.width + tolerance &&
    rect.bottom <= viewport.height + tolerance
  );
}
