import { describe, expect, it } from 'vitest';
import { formatMenuNetworkSummary, probeMenuNetwork } from './menuNetwork.js';

describe('menu network helpers', () => {
  it('reports online snapshots with latency', async () => {
    let nowValue = 1000;
    const snapshot = await probeMenuNetwork({
      fetchImpl: async () => {
        nowValue = 1042;
        return { ok: true };
      },
      now: () => nowValue,
      probeUrl: '/favicon.svg',
    });
    expect(snapshot.state).toBe('online');
    expect(snapshot.latencyMs).toBe(42);
    expect(formatMenuNetworkSummary(snapshot, { locale: 'en-US' })).toContain('Reachable');
  });

  it('reports offline snapshots when the probe fails', async () => {
    const snapshot = await probeMenuNetwork({
      fetchImpl: async () => {
        throw new Error('offline');
      },
      now: () => 5000,
    });
    expect(snapshot.state).toBe('offline');
    expect(snapshot.latencyMs).toBeNull();
  });
});
