// @ts-check
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetE2eDatabase, getPort, sleep, SERVER_START_TIMEOUT_MS } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '.e2e-shared-server-pid');

export default async function globalSetup() {
  process.env.E2E_PORT = '3001';
  if (!process.env.DATABASE_URL_E2E) {
    throw new Error('DATABASE_URL_E2E is not set; cannot run e2e global setup.');
  }

  resetE2eDatabase();

  const port = getPort();
  const server = spawn('node', ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ADMIN_PASSWORD: '1234',
      E2E_TEST: 'true',
      DATABASE_URL: process.env.DATABASE_URL_E2E,
    },
    stdio: 'ignore',
    detached: true,
  });
  server.unref();

  const url = `http://127.0.0.1:${port}/`;
  const start = Date.now();
  while (Date.now() - start < SERVER_START_TIMEOUT_MS) {
    if (server.exitCode != null && server.exitCode !== 0) {
      throw new Error(`Server exited early with code ${server.exitCode}`);
    }
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        fs.writeFileSync(PID_FILE, String(server.pid), 'utf8');
        return;
      }
    } catch {
      await sleep(200);
    }
  }
  server.kill('SIGKILL');
  throw new Error(`Server at ${url} did not respond with OK within ${SERVER_START_TIMEOUT_MS}ms`);
}
