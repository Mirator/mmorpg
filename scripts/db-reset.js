import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const target = process.argv[2] ?? 'test';
const envVar = target === 'e2e' ? 'DATABASE_URL_E2E' : 'DATABASE_URL_TEST';
const dbUrl = process.env[envVar];

if (!dbUrl) {
  console.error(`Missing ${envVar} in environment.`);
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: dbUrl };
const result = spawnSync(
  'npx',
  ['prisma', 'migrate', 'reset', '--force', '--skip-seed'],
  { stdio: 'inherit', env }
);

process.exit(result.status ?? 1);
