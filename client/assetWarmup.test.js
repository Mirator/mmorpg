import { describe, expect, it } from 'vitest';
import { createAssetWarmup } from './assetWarmup.js';

function createDeferred() {
  /** @type {(value?: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function flushWarmup() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createAssetWarmup', () => {
  it('runs tasks in tier order and dedupes repeated keys', async () => {
    const started = [];
    const warmup = createAssetWarmup({ maxConcurrency: 1 });

    warmup.startSession([
      [
        { key: 'a', run: () => { started.push('a'); } },
        { key: 'a', run: () => { started.push('a-duplicate'); } },
      ],
      [{ key: 'b', run: () => { started.push('b'); } }],
    ]);

    await flushWarmup();
    await flushWarmup();

    expect(started).toEqual(['a', 'b']);
    expect(warmup.isIdle()).toBe(true);
  });

  it('drops queued work from stale sessions while allowing the active task to finish', async () => {
    const started = [];
    const firstTask = createDeferred();
    const warmup = createAssetWarmup({ maxConcurrency: 1 });

    warmup.startSession([
      [
        {
          key: 'old-active',
          run: () => {
            started.push('old-active');
            return firstTask.promise;
          },
        },
        {
          key: 'old-queued',
          run: () => {
            started.push('old-queued');
          },
        },
      ],
    ]);

    await flushWarmup();
    warmup.cancelSession();
    warmup.startSession([
      [
        {
          key: 'new-active',
          run: () => {
            started.push('new-active');
          },
        },
      ],
    ]);

    firstTask.resolve();
    await flushWarmup();
    await flushWarmup();

    expect(started).toEqual(['old-active', 'new-active']);
  });
});
