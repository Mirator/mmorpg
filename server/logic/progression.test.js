import { describe, it, expect } from 'vitest';
import { addXp, calculateMobXp, xpToNext } from '../../shared/progression.js';

describe('progression', () => {
  it('computes XP curve milestones', () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(5)).toBe(207);
    expect(xpToNext(10)).toBe(928);
    expect(xpToNext(20)).toBe(0);
  });

  it('calculates XP reward by level difference', () => {
    expect(calculateMobXp(5, 1)).toBe(0);
    expect(calculateMobXp(4, 1)).toBe(128);
    expect(calculateMobXp(1, 4)).toBe(8);
  });

  it('levels up when XP crosses threshold', () => {
    const result = addXp({ level: 1, xp: 90 }, 20);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(10);
  });
});
