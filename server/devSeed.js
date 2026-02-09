import { generateId, hashPassword, isValidPassword, normalizeUsername } from './auth.js';
import { createAccount, findAccountByUsernameLower } from './db/accountRepo.js';

function isLocalhostHost(host) {
  return host === '127.0.0.1' || host === 'localhost';
}

export async function seedDevAccount({ env, config, logger = console, deps = {} }) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' || nodeEnv === 'test') return;
  if (env.E2E_TEST === 'true') return;

  const host = config?.host ?? env.HOST ?? '';
  if (!isLocalhostHost(host)) return;

  const username = env.DEV_ACCOUNT_USER ?? 'test';
  const password = env.DEV_ACCOUNT_PASSWORD ?? 'test1234';
  const normalized = normalizeUsername(username);
  if (!normalized) {
    logger.warn?.('[dev] Skipping dev account seed: invalid username.');
    return;
  }
  if (!isValidPassword(password)) {
    logger.warn?.('[dev] Skipping dev account seed: invalid password length.');
    return;
  }

  const findAccount = deps.findAccountByUsernameLower ?? findAccountByUsernameLower;
  const create = deps.createAccount ?? createAccount;
  const hashFn = deps.hashPassword ?? hashPassword;
  const idFn = deps.generateId ?? generateId;

  try {
    const existing = await findAccount(normalized.lower);
    if (existing) return;

    const { hash, salt } = await hashFn(password);
    await create({
      id: idFn(),
      username: normalized.name,
      usernameLower: normalized.lower,
      passwordHash: hash,
      passwordSalt: salt,
      lastSeenAt: new Date(),
    });

    logger.log?.(`[dev] Seeded account "${normalized.name}".`);
  } catch (err) {
    if (err?.code === 'P2021') {
      logger.warn?.('[dev] Skipping dev account seed: database not migrated.');
      return;
    }
    throw err;
  }
}
