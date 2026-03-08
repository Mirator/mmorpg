// @ts-check

/** @type {{ debug: number, info: number, warn: number, error: number }} */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function getLevel() {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return LEVELS[/** @type {keyof typeof LEVELS} */ (env)];
  return process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug;
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
