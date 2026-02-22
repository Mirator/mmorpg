import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from './history.js';

describe('map-v2 history', () => {
  it('pushes snapshots and supports undo/redo', () => {
    const history = createHistory(5);
    const first = { mapSize: 10 };
    const second = { mapSize: 20 };

    pushHistory(history, first);
    expect(canUndo(history)).toBe(true);

    const prev = undo(history, second);
    expect(prev).toEqual(first);
    expect(canRedo(history)).toBe(true);

    const next = redo(history, first);
    expect(next).toEqual(second);
  });

  it('enforces history size limit', () => {
    const history = createHistory(2);
    pushHistory(history, { id: 1 });
    pushHistory(history, { id: 2 });
    pushHistory(history, { id: 3 });

    expect(history.undo).toHaveLength(2);
    expect(history.undo[0]).toEqual({ id: 2 });
    expect(history.undo[1]).toEqual({ id: 3 });
  });

  it('returns null when undo/redo not possible', () => {
    const history = createHistory();
    expect(undo(history, { a: 1 })).toBeNull();
    expect(redo(history, { a: 1 })).toBeNull();
  });
});
