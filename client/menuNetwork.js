// @ts-check

/**
 * @typedef {{
 *   state: 'online' | 'degraded' | 'offline';
 *   label: string;
 *   latencyMs: number | null;
 *   checkedAt: number;
 * }} MenuNetworkSnapshot
 */

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   probeUrl?: string,
 * }} [options]
 * @returns {Promise<MenuNetworkSnapshot>}
 */
export async function probeMenuNetwork({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  probeUrl = '/favicon.svg',
} = {}) {
  const startedAt = now();
  const separator = probeUrl.includes('?') ? '&' : '?';
  const url = `${probeUrl}${separator}menu_probe=${startedAt}`;

  try {
    const response = await fetchImpl(url, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin',
    });
    const checkedAt = now();
    const latencyMs = Math.max(1, Math.round(checkedAt - startedAt));
    if (response?.ok) {
      return {
        state: 'online',
        label: 'Reachable',
        latencyMs,
        checkedAt,
      };
    }
    return {
      state: 'degraded',
      label: `Reply ${response?.status ?? 'unknown'}`,
      latencyMs,
      checkedAt,
    };
  } catch {
    return {
      state: 'offline',
      label: 'No route',
      latencyMs: null,
      checkedAt: now(),
    };
  }
}

/**
 * @param {MenuNetworkSnapshot | null | undefined} snapshot
 * @param {{ locale?: string }} [options]
 */
export function formatMenuNetworkSummary(snapshot, { locale = 'en-US' } = {}) {
  if (!snapshot) {
    return 'Awaiting network whisper';
  }
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(snapshot.checkedAt));
  const latency = snapshot.latencyMs == null ? 'latency unknown' : `~${snapshot.latencyMs}ms`;
  return `${snapshot.label} · ${latency} · checked ${time}`;
}
