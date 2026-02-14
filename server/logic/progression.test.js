import { describe, it, expect } from 'vitest';
import { addXp, calculateMobXp, xpToNext } from '../../shared/progression.js';

describe('progression', () => {
  it('computes XP curve milestones', () => {
    expect(xpToNext(1)).toBe(190);
    expect(xpToNext(10)).toBe(19_000);
    expect(xpToNext(20)).toBe(76_000);
    expect(xpToNext(29)).toBe(159_790);
    expect(xpToNext(30)).toBe(0);
  });

  it('calculates XP reward by level difference', () => {
    expect(calculateMobXp(5, 1)).toBe(170);
    expect(calculateMobXp(4, 1)).toBe(125);
    expect(calculateMobXp(1, 4)).toBe(14);
  });

  it('levels up when XP crosses threshold', () => {
    const result = addXp({ level: 1, xp: 90 }, 100);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(0);
  });
});
