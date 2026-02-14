import 'dotenv/config';
import { hashPassword, generateId } from '../server/auth.js';
import { createAccount, findAccountByUsernameLower } from '../server/db/accountRepo.js';
import { disconnectPrisma } from '../server/db/client.js';

const E2E_USERNAME = 'e2e_tester';
const E2E_PASSWORD = 'e2e_password';

async function seedE2e() {
  const dbUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_E2E;
  if (!dbUrl) {
    console.error('DATABASE_URL or DATABASE_URL_E2E must be set.');
    process.exit(1);
  }
  process.env.DATABASE_URL = dbUrl;

  const normalized = { name: E2E_USERNAME, lower: E2E_USERNAME.toLowerCase() };
  const existing = await findAccountByUsernameLower(normalized.lower);
  if (existing) {
    return;
  }

  const { hash, salt } = await hashPassword(E2E_PASSWORD);
  await createAccount({
    id: generateId(),
    username: normalized.name,
    usernameLower: normalized.lower,
    passwordHash: hash,
    passwordSalt: salt,
    lastSeenAt: new Date(),
  });
  console.log(`[e2e] Seeded account "${normalized.name}".`);
}

seedE2e()
  .then(() => disconnectPrisma())
  .catch((err) => {
    console.error('[e2e] Seed failed:', err);
    process.exit(1);
  });
