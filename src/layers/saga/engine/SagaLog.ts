/**
 * SagaLog — append-only record of state transitions + step events.
 *
 * Every meaningful thing that happens to a saga instance becomes an
 * immutable `SagaLogEntry`: state changes, step starts/finishes/failures,
 * retries, timeouts, compensations. The log is the audit trail and the
 * replay source — a saga's current state is derivable by folding its
 * entries, which is exactly what `replay` does.
 *
 * Layout: `entries` is one global array (seq = index) for cross-saga
 * auditing; `bySaga` keeps per-instance cursors so reading one saga's
 * history is O(its length), not O(global).
 *
 * @module SagaLayer/Engine
 */

import { SagaLifecycle, SagaLogEntry } from './types';

export class SagaLog {
  private readonly entries: SagaLogEntry[] = [];
  private readonly bySaga = new Map<string, number[]>();
  private seq = 0;

  append(
    sagaId: string,
    at: number,
    kind: SagaLogEntry['kind'],
    extra: Partial<Pick<SagaLogEntry, 'state' | 'step' | 'detail'>> = {}
  ): SagaLogEntry {
    const e: SagaLogEntry = { seq: this.seq++, sagaId, at, kind, ...extra };
    this.entries.push(e);
    let idx = this.bySaga.get(sagaId);
    if (!idx) {
      idx = [];
      this.bySaga.set(sagaId, idx);
    }
    idx.push(e.seq);
    return e;
  }

  /** All entries for one saga, in order. */
  forSaga(sagaId: string): SagaLogEntry[] {
    return (this.bySaga.get(sagaId) ?? []).map((i) => this.entries[i]);
  }

  /** All entries globally (audit view). */
  all(): readonly SagaLogEntry[] {
    return this.entries;
  }

  /** Latest lifecycle state recorded for a saga, or null. */
  latestState(sagaId: string): SagaLifecycle | null {
    const idx = this.bySaga.get(sagaId);
    if (!idx) return null;
    for (let i = idx.length - 1; i >= 0; i--) {
      const e = this.entries[idx[i]];
      if (e.kind === 'state' && e.state) return e.state;
    }
    return null;
  }

  /**
   * Rebuilds a saga's observable state by folding its log — the recovery
   * path after a crash: the instance's last known position is replayed
   * rather than re-executed.
   */
  replay(sagaId: string): {
    state: SagaLifecycle;
    completedSteps: string[];
    compensatedSteps: string[];
  } {
    let state: SagaLifecycle = 'started';
    const completed = new Set<string>();
    const compensated = new Set<string>();
    for (const e of this.forSaga(sagaId)) {
      if (e.kind === 'state' && e.state) state = e.state;
      if (e.kind === 'step_succeeded' && e.step) completed.add(e.step);
      if (e.kind === 'compensated_step' && e.step) compensated.add(e.step);
    }
    return { state, completedSteps: [...completed], compensatedSteps: [...compensated] };
  }

  /** Human-readable trace — the "what happened" debug view. */
  render(sagaId: string): string {
    return this.forSaga(sagaId)
      .map((e) => {
        const parts = [`#${e.seq}`, e.kind];
        if (e.state) parts.push(`state=${e.state}`);
        if (e.step) parts.push(`step=${e.step}`);
        if (e.detail) parts.push(`(${e.detail})`);
        return parts.join(' ');
      })
      .join('\n');
  }
}
