import { describe, expect, it } from 'vitest';
import {
  isClickableInViewport,
  isWithinViewport,
  rectanglesOverlap,
  sanitizeToken,
} from './layout.js';

describe('main scenario layout helpers', () => {
  it('sanitizes artifact tokens into stable slugs', () => {
    expect(sanitizeToken(' Repair Flow / Run #1 ')).toBe('repair-flow-run-1');
    expect(sanitizeToken('***')).toBe('run');
  });

  it('detects overlapping rectangles', () => {
    expect(
      rectanglesOverlap(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 5, top: 5, right: 15, bottom: 15 }
      )
    ).toBe(true);
    expect(
      rectanglesOverlap(
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: 10, top: 10, right: 20, bottom: 20 }
      )
    ).toBe(false);
  });

  it('validates viewport placement for clickable and tolerated bounds', () => {
    const viewport = { width: 100, height: 80 };
    const inside = { left: 1, top: 2, right: 50, bottom: 40, width: 49, height: 38 };
    const slightlyOutside = { left: -2, top: -1, right: 101, bottom: 79, width: 103, height: 80 };

    expect(isClickableInViewport(inside, viewport)).toBe(true);
    expect(isClickableInViewport(slightlyOutside, viewport)).toBe(false);
    expect(isWithinViewport(slightlyOutside, viewport, 2)).toBe(true);
  });
});
