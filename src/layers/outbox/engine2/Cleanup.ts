/**
 * Outbox Cleanup Policies
 *
 * Lifecycle after `sent`: a processed record moves to an archive store
 * (kept for audit/replay-investigation) once it outlives
 * `sentRetentionMs`; archived records past `archiveRetentionMs` are
 * purged for real. `failed` records are terminal — they archive on
 * `failedRetentionMs` too, so the live store holds only work-in-flight.
 *
 * The split matters because the hot path (`claim`, `poll`, metrics)
 * scans the live store: every archived record is one fewer row those
 * scans touch. The archive is the cold store — queryable, not
 * performance-critical.
 *
 * Storage: two in-memory FIFO arrays, archive kept insertion-ordered
 * (append on archive = chronological). `run()` is one O(L) pass over
 * live + O(A) over archive per policy window.
 *
 * @module OutboxLayer/Engine2
 */

import { MetricsRecord } from './Metrics';
import {
  ArchivePolicy,
  CleanupReport,
  OutboxClock2,
  SystemOutboxClock2,
} from './types';

interface ArchivedRecord extends MetricsRecord {
  readonly archivedAt: number;
  readonly priorState: 'sent' | 'failed';
}

export class OutboxCleaner {
  private readonly _clock: OutboxClock2;
  private readonly _policy: ArchivePolicy;
  private readonly _live = new Map<string, MetricsRecord>();
  private readonly _archive = new Map<string, ArchivedRecord>();

  constructor(policy: ArchivePolicy, clock: OutboxClock2 = new SystemOutboxClock2()) {
    if (policy.sentRetentionMs <= 0) {
      throw new Error('sentRetentionMs must be positive');
    }
    this._policy = policy;
    this._clock = clock;
  }

  /** Insert or replace a live record (the store the relay mutates). */
  put(record: MetricsRecord): void {
    this._live.set(record.id, { ...record });
  }

  get(id: string): MetricsRecord | undefined {
    const r = this._live.get(id);
    return r ? { ...r } : undefined;
  }

  live(state?: MetricsRecord['state']): MetricsRecord[] {
    const out: MetricsRecord[] = [];
    for (const r of this._live.values()) {
      if (state === undefined || r.state === state) out.push({ ...r });
    }
    return out;
  }

  liveDepth(state?: MetricsRecord['state']): number {
    return this.live(state).length;
  }

  /** Archived records, insertion order (chronological by archive time). */
  archived(): ArchivedRecord[] {
    return [...this._archive.values()].map((r) => ({ ...r }));
  }

  archivedGet(id: string): ArchivedRecord | undefined {
    const r = this._archive.get(id);
    return r ? { ...r } : undefined;
  }

  get archiveDepth(): number {
    return this._archive.size;
  }

  /**
   * Run one policy pass:
   *   - sent records older than sentRetentionMs → archive
   *   - failed records older than failedRetentionMs (if set) → archive
   *   - archived records older than archiveRetentionMs (if set) → purge
   * Records carry their own timestamps; the clock supplies `now`.
   */
  run(): CleanupReport {
    const now = this._clock.now();
    let archived = 0;
    let purged = 0;

    for (const [id, r] of this._live) {
      if (r.state === 'sent' && now - r.enqueuedAt >= this._policy.sentRetentionMs) {
        this._archive.set(id, { ...r, archivedAt: now, priorState: 'sent' });
        this._live.delete(id);
        archived++;
      } else if (
        r.state === 'failed' &&
        this._policy.failedRetentionMs !== undefined &&
        now - r.enqueuedAt >= this._policy.failedRetentionMs
      ) {
        this._archive.set(id, { ...r, archivedAt: now, priorState: 'failed' });
        this._live.delete(id);
        archived++;
      }
    }

    if (this._policy.archiveRetentionMs !== undefined) {
      for (const [id, r] of this._archive) {
        if (now - r.archivedAt >= this._policy.archiveRetentionMs) {
          this._archive.delete(id);
          purged++;
        }
      }
    }

    return {
      archived,
      purged,
      retained: this._live.size,
      archiveDepth: this._archive.size,
    };
  }
}
