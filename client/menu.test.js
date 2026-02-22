import { describe, expect, it } from 'vitest';
import {
  validateUsername,
  validatePassword,
  validateCharacterName,
  getClassMeta,
} from './menu.js';

describe('menu validation and class metadata', () => {
  it('validates username rules', () => {
    expect(validateUsername('')).toContain('required');
    expect(validateUsername('ab')).toContain('3-20');
    expect(validateUsername('name!')).toContain('3-20');
    expect(validateUsername('valid_name')).toBe('');
  });

  it('validates password rules', () => {
    expect(validatePassword('')).toContain('required');
    expect(validatePassword('short')).toContain('8-64');
    expect(validatePassword('long-enough-password')).toBe('');
  });

  it('validates character names', () => {
    expect(validateCharacterName('')).toContain('required');
    expect(validateCharacterName('A')).toContain('3-16');
    expect(validateCharacterName('Bad*Name')).toContain('3-16');
    expect(validateCharacterName('Knight 01')).toBe('');
  });

  it('returns class metadata for preview cards', () => {
    const fighter = getClassMeta('fighter');
    expect(fighter.name).toBe('Fighter');
    expect(fighter.role).toBe('Melee DPS');
    expect(fighter.blurb.length).toBeGreaterThan(3);
  });
});
