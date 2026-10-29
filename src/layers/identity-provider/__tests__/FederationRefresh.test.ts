/**
 * Metadata refresher tests — scheduling, backoff, staleness.
 */

import { describe, it, expect } from 'bun:test';
import { MetadataRefresher } from '../federation/MetadataRefresh';
import { spMeta } from './helpers';

describe('MetadataRefresher', () => {
  it('schedules entities on interval, exponential backoff on failure', () => {
    const r = new MetadataRefresher({ intervalMs: 60_000, failureBaseMs: 1_000, failureCapMs: 10_000 });
    r.track('e1');
    // Never refreshed -> due immediately
    expect(r.dueEntities(0)).toContain('e1');
    r.reportSuccess('e1', { ...spMeta('e1'), validUntil: 120_000 }, 0);
    expect(r.dueEntities(30_000)).not.toContain('e1');
    expect(r.dueEntities(61_000)).toContain('e1');
    // Fail -> backoff 1s, 2s, 4s...
    r.reportFailure('e1', 61_000);
    expect(r.dueEntities(61_500)).not.toContain('e1');
    expect(r.dueEntities(62_100)).toContain('e1');
    r.reportFailure('e1', 62_000);
    expect(r.dueEntities(63_500)).not.toContain('e1');
    expect(r.dueEntities(64_100)).toContain('e1');
  });

  it('marks documents stale past validUntil', () => {
    const r = new MetadataRefresher();
    r.track('e1', 1_000);
    expect(r.staleEntities(999)).toEqual([]);
    expect(r.staleEntities(1_001)).toEqual(['e1']);
    expect(r.state('e1')?.stale).toBe(true);
  });
});
