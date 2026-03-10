// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PID_FILE = path.join(__dirname, '.e2e-shared-server-pid');

export default async function globalTeardown() {
  try {
    const raw = fs.readFileSync(PID_FILE).toString();
    const pid = parseInt(raw.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGKILL');
      }
    }
  } catch {
    // No PID file or already dead
  } finally {
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  }
}
