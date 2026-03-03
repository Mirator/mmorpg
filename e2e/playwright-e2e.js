// @ts-check
import { runScenario } from './runtime/core.js';
import { runMainFlow } from './scenarios/main/runner.js';

const E2E_ATTEMPTS = Math.max(1, Number.parseInt(process.env.E2E_ATTEMPTS ?? '', 10) || 1);

async function runWithRetries(/** @type {any} */ maxAttempts = E2E_ATTEMPTS) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runScenario({
        name: 'main-e2e',
        async run(/** @type {any} */ ctx) {
          await runMainFlow(ctx);
        },
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        console.log(`E2E attempt ${attempt} failed, retrying...`);
      }
    }
  }
  throw lastErr;
}

runWithRetries(E2E_ATTEMPTS).catch((/** @type {any} */ err) => {
  console.error(err);
  process.exit(1);
});
