// @ts-check
import { test } from '@playwright/test';
import { runScenario } from '../runtime/core.js';
import { scenarioSmoke as tutorialSmokeScenario } from '../scenarios/tutorial.js';

test('tutorial smoke', async () => {
  process.env.E2E_USE_SHARED_SERVER = 'true';
  process.env.E2E_PORT = '3001';
  await runScenario({
    name: tutorialSmokeScenario.name,
    run(ctx) {
      return tutorialSmokeScenario.run(ctx);
    },
  });
});
