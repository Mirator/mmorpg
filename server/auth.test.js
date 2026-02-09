import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  isValidPassword,
  normalizeCharacterName,
  normalizeUsername,
  verifyPassword,
} from './auth.js';

describe('auth helpers', () => {
  it('normalizes usernames and enforces constraints', () => {
    expect(normalizeUsername('Player_One')).toEqual({
      name: 'Player_One',
      lower: 'player_one',
    });
    expect(normalizeUsername('ab')).toBeNull();
    expect(normalizeUsername('a'.repeat(21))).toBeNull();
    expect(normalizeUsername('bad name')).toBeNull();
  });

  it('normalizes character names and collapses spaces', () => {
    expect(normalizeCharacterName('  Hero  One  ')).toEqual({
      name: 'Hero One',
      lower: 'hero one',
    });
    expect(normalizeCharacterName('A')).toBeNull();
    expect(normalizeCharacterName('Name_With_Underscore')).toBeNull();
  });

  it('validates password length', () => {
    expect(isValidPassword('short')).toBe(false);
    expect(isValidPassword('longenough')).toBe(true);
    expect(isValidPassword('x'.repeat(65))).toBe(false);
  });

  it('hashes and verifies passwords', async () => {
    const { hash, salt } = await hashPassword('password123');
    expect(await verifyPassword('password123', hash, salt)).toBe(true);
    expect(await verifyPassword('wrong', hash, salt)).toBe(false);
  });
});
