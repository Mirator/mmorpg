// @ts-check

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function getLevel() {
  if (typeof window === 'undefined') return LEVELS.debug;
  try {
    const host = window.location?.hostname ?? '';
    if (host === 'localhost' || host === '127.0.0.1') return LEVELS.debug;
  } catch {
    return LEVELS.debug;
  }
  return LEVELS.info;
}

const currentLevel = getLevel();

/**
 * @param {number} level
 * @param {'debug'|'info'|'warn'|'error'} method
 * @param {unknown[]} args
 */
function write(level, method, args) {
  if (level < currentLevel) return;
  const fn = console[method] ?? console.log;
  fn.apply(console, args);
}

export const logger = {
  debug(/** @type {unknown[]} */ ...args) { write(LEVELS.debug, 'debug', args); },
  info(/** @type {unknown[]} */ ...args) { write(LEVELS.info, 'info', args); },
  warn(/** @type {unknown[]} */ ...args) { write(LEVELS.warn, 'warn', args); },
  error(/** @type {unknown[]} */ ...args) { write(LEVELS.error, 'error', args); },
};
