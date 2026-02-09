import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const CHARACTER_RE = /^[A-Za-z0-9 ]{3,16}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 64;

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function normalizeUsername(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!USERNAME_RE.test(trimmed)) return null;
  return {
    name: trimmed,
    lower: trimmed.toLowerCase(),
  };
}

export function normalizeCharacterName(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/\s+/g, ' ');
  if (!CHARACTER_RE.test(trimmed)) return null;
  return {
    name: trimmed,
    lower: trimmed.toLowerCase(),
  };
}

export function isValidPassword(input) {
  if (typeof input !== 'string') return false;
  return input.length >= PASSWORD_MIN && input.length <= PASSWORD_MAX;
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return {
    hash: Buffer.from(hash).toString('base64'),
    salt: salt.toString('base64'),
  };
}

export async function verifyPassword(password, hashBase64, saltBase64) {
  if (typeof password !== 'string') return false;
  if (!hashBase64 || !saltBase64) return false;
  const hash = Buffer.from(hashBase64, 'base64');
  const salt = Buffer.from(saltBase64, 'base64');
  const derived = await scryptAsync(password, salt, hash.length);
  return crypto.timingSafeEqual(hash, Buffer.from(derived));
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function generateId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${crypto.randomBytes(6).toString('hex')}`;
}
