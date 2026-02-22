import { describe, expect, it } from 'vitest';
import {
  canvasToWorld,
  clampWorldPosition,
  createViewMetrics,
  pointInRect,
  snapWorldPosition,
  worldToCanvas,
} from './canvas.js';

describe('map-v2 canvas math', () => {
  it('round-trips world and canvas coordinates', () => {
    const metrics = createViewMetrics({
      width: 1000,
      height: 800,
      mapSize: 400,
      zoom: 1,
      offsetX: 10,
      offsetY: -5,
    });

    const world = { x: 25, z: -14 };
    const canvas = worldToCanvas(world, metrics);
    const back = canvasToWorld(canvas, metrics);

    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.z).toBeCloseTo(world.z, 6);
  });

  it('clamps world positions to bounds and y limits', () => {
    const clamped = clampWorldPosition(
      { mapSize: 40, mapYMin: -5, mapYMax: 5 },
      { x: 100, y: 40, z: -100 },
      3
    );

    expect(clamped).toEqual({ x: 17, y: 5, z: -17 });
  });

  it('snaps positions when enabled', () => {
    const snapped = snapWorldPosition({ x: 2.49, z: -2.51 }, true, 0.5);
    expect(snapped).toEqual({ x: 2.5, y: undefined, z: -2.5 });

    const unsnapped = snapWorldPosition({ x: 2.49, z: -2.51 }, false, 0.5);
    expect(unsnapped).toEqual({ x: 2.49, z: -2.51 });
  });

  it('checks point inclusion for selection rectangle', () => {
    expect(pointInRect({ x: 10, y: 10 }, { x: 0, y: 0, w: 20, h: 20 })).toBe(true);
    expect(pointInRect({ x: 30, y: 10 }, { x: 0, y: 0, w: 20, h: 20 })).toBe(false);
  });
});
