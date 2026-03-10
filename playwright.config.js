// @ts-check
import { defineConfig, devices } from '@playwright/test';

const PORT = Number.parseInt(process.env.E2E_PORT ?? '', 10) || 3001;
const BASE_URL = `http://localhost:${PORT}`;
const includeFullGameplay = process.env.E2E_FULL === 'true';

export default defineConfig({
  testDir: 'e2e/tests',
  globalSetup: 'e2e/global-setup.js',
  globalTeardown: 'e2e/global-teardown.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: includeFullGameplay ? 'gameplay-full' : 'gameplay-smoke',
      testMatch: includeFullGameplay ? /(main|trade)\.spec\.js$/ : /main\.spec\.js$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testMatch: /admin\.spec\.js$/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
