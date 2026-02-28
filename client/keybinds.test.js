import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  isKeyMatch,
  normalizeKeyString,
} from './keybinds.js';

describe('keybind normalization', () => {
  it('defaults toggleWalk to CapsLock', () => {
    expect(DEFAULT_KEYBINDS.toggleWalk).toBe('CapsLock');
  });

  it('normalizes CapsLock consistently', () => {
    expect(normalizeKeyString('capslock')).toBe('CapsLock');
    expect(normalizeKeyString('CapsLock')).toBe('CapsLock');
  });

  it('matches CapsLock against the toggleWalk binding', () => {
    expect(
      isKeyMatch(
        { key: 'CapsLock', code: 'CapsLock' },
        'toggleWalk'
      )
    ).toBe(true);
  });
});
