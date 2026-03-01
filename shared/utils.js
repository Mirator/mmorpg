// @ts-check

/**
 * Escape HTML special characters to prevent XSS when rendering user-controlled
 * or server-sourced content via innerHTML.
 * Works in both Node and browser environments.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
