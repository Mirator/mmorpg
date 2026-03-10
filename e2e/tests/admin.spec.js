// @ts-check
import { test } from '@playwright/test';
import { runSmoke } from '../playwright-admin-map-v2.js';

test('admin map v2', async () => {
  const prevPort = process.env.E2E_PORT;
  process.env.E2E_PORT = '3907';
  try {
    await runSmoke();
  } finally {
    if (prevPort !== undefined) {
      process.env.E2E_PORT = prevPort;
    } else {
      delete process.env.E2E_PORT;
    }
  }
});
