// @ts-check

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const scenarioFiles = [
  'playwright-e2e-tutorial.js',
  'playwright-e2e-trade.js',
  'playwright-e2e-duel.js',
];

for (const file of scenarioFiles) {
  const scriptPath = path.join(__dirname, file);
  console.log(`[e2e] Running ${file}`);
  const result = spawnSync('node', [scriptPath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
