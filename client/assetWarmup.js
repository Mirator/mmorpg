// @ts-check

/**
 * @typedef {{ key: string, run: () => unknown | Promise<unknown> }} WarmupTask
 */

/**
 * @param {WarmupTask[] | null | undefined} tasks
 * @returns {WarmupTask[]}
 */
function uniqueTasks(tasks) {
  const deduped = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task?.key || typeof task.run !== 'function') continue;
    if (!deduped.has(task.key)) {
      deduped.set(task.key, task);
    }
  }
  return [...deduped.values()];
}

/**
 * @param {{ maxConcurrency?: number, onError?: (error: unknown, task: WarmupTask) => void }} [options]
 */
export function createAssetWarmup({ maxConcurrency = 3, onError = () => {} } = {}) {
  const concurrency = Math.max(1, Number.isFinite(maxConcurrency) ? Math.floor(maxConcurrency) : 3);
  const cachedRuns = new Map();
  /** @type {WarmupTask[]} */
  let queue = [];
  let activeCount = 0;
  let sessionToken = 0;

  /** @param {number} token */
  function schedulePump(token) {
    queueMicrotask(() => {
      if (token !== sessionToken) return;
      pump(token);
    });
  }

  /**
   * @param {WarmupTask} task
   * @param {number} token
   */
  function runTask(task, token) {
    if (cachedRuns.has(task.key)) return;
    activeCount += 1;

    const promise = Promise.resolve()
      .then(() => task.run())
      .catch((error) => {
        cachedRuns.delete(task.key);
        onError(error, task);
      })
      .finally(() => {
        activeCount = Math.max(0, activeCount - 1);
        pump(sessionToken);
      });

    cachedRuns.set(task.key, promise);
  }

  /** @param {number} token */
  function pump(token) {
    if (token !== sessionToken) return;
    while (activeCount < concurrency && queue.length > 0) {
      const nextTask = queue.shift();
      if (!nextTask || cachedRuns.has(nextTask.key)) continue;
      runTask(nextTask, token);
    }
  }

  /** @param {WarmupTask[][]} [tiers] */
  function startSession(tiers = []) {
    sessionToken += 1;
    queue = [];
    for (const tier of tiers) {
      queue.push(...uniqueTasks(tier));
    }
    schedulePump(sessionToken);
  }

  /** @param {WarmupTask[]} [tierTasks] */
  function enqueue(tierTasks = []) {
    queue.push(...uniqueTasks(tierTasks));
    schedulePump(sessionToken);
  }

  function cancelSession() {
    sessionToken += 1;
    queue = [];
  }

  return {
    startSession,
    enqueue,
    cancelSession,
    isIdle: () => activeCount === 0 && queue.length === 0,
  };
}
