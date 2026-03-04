// @ts-check

/**
 * @param {HTMLInputElement | HTMLSelectElement} input
 */
export function parseControlValue(input) {
  if (input instanceof HTMLSelectElement) {
    if (input.dataset.valueType === 'boolean') return input.value === 'true';
    return input.value;
  }

  if (input.type === 'number') {
    const parsed = Number.parseFloat(input.value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return input.value;
}

/**
 * @param {unknown[]} list
 * @param {string} prefix
 */
export function nextId(list, prefix) {
  const used = new Set((Array.isArray(list) ? list : []).map((item) => String(/** @type {any} */ (item)?.id ?? '')));
  let i = 1;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}
