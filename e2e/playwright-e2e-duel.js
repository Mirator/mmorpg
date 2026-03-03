// @ts-check

import { runScenario } from './runtime/core.js';
import { scenario } from './scenarios/duel.js';

runScenario(scenario).catch((/** @type {any} */ error) => {
  console.error(error);
  process.exit(1);
});
