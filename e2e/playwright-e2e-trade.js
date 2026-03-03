// @ts-check

import { runScenario } from './runtime/core.js';
import { scenario } from './scenarios/trade.js';

runScenario(scenario).catch((/** @type {any} */ error) => {
  console.error(error);
  process.exit(1);
});
