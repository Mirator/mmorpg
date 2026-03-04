// @ts-check

/**
 * @param {{
 *   statusEl: HTMLElement,
 *   saveStatusEl: HTMLElement,
 *   errorsEl: HTMLElement
 * }} elements
 */
export function createStatusRenderers({ statusEl, saveStatusEl, errorsEl }) {
  /**
   * @param {string} message
   * @param {string} [tone]
   */
  function setStatus(message, tone = 'neutral') {
    statusEl.textContent = message;
    statusEl.className = `status ${tone}`;
  }

  /**
   * @param {string} message
   * @param {string} [tone]
   */
  function setSaveStatus(message, tone = 'neutral') {
    saveStatusEl.textContent = message;
    saveStatusEl.className = `status compact ${tone}`;
  }

  /**
   * @param {string[]} errors
   */
  function setErrors(errors) {
    errorsEl.textContent = '';
    if (!errors || errors.length === 0) return;
    const list = document.createElement('ul');
    for (const error of errors) {
      const li = document.createElement('li');
      li.textContent = error;
      list.appendChild(li);
    }
    errorsEl.appendChild(list);
  }

  /**
   * @param {number} value
   * @param {number} [digits]
   */
  function formatNumber(value, digits = 2) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
  }

  return {
    setStatus,
    setSaveStatus,
    setErrors,
    formatNumber,
  };
}
