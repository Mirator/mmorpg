// @ts-check
import { test } from '@playwright/test';
import { runScenario } from '../runtime/core.js';
import { scenario as tradeScenario } from '../scenarios/trade.js';

test('trade scenario', async () => {
  process.env.E2E_USE_SHARED_SERVER = 'true';
  process.env.E2E_PORT = '3001';
  await runScenario({
    name: 'trade-e2e',
    run(ctx) {
      return tradeScenario.run(ctx);
    },
  });
});
