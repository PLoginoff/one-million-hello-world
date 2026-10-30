/**
 * DLQ Size Alerts
 *
 * Threshold hooks over pending queue depth with edge-triggered
 * semantics: a hook fires once when depth crosses *up through* a
 * threshold (`entered: true`), then stays quiet while depth remains
 * above it — DLQ alerting must page the human once, not per message.
 * Crossing back below and re-crossing re-arms the edge.
 *
 * Multiple thresholds per queue are supported (warn at 100, page at
 * 1000). `check()` evaluates one queue on demand — callers wire it to
 * enqueue/post-tick hooks. `poll()` sweeps every known queue.
 *
 * Depth counted = `pending` + `replaying` (claimed-but-unsettled still
 * occupies the queue). Quarantined records are excluded — they are
 * parked, not backlogged.
 *
 * @module DeadLetterLayer/Engine2
 */

import {
  DlqClock2,
  SizeAlert,
  SizeAlertHook,
  SizeThreshold,
  SystemDlqClock2,
} from './types';
import { RecordStore } from './RecordStore';

export class SizeAlertRegistry {
  private readonly _store: RecordStore;
  private readonly _clock: DlqClock2;
  private readonly _hook: SizeAlertHook;
  /** queue → thresholds, kept sorted ascending by depth. */
  private readonly _thresholds = new Map<string, SizeThreshold[]>();
  /** queue → set of threshold.depth currently exceeded (edge state). */
  private readonly _above = new Map<string, Set<number>>();

  constructor(
    store: RecordStore,
    hook: SizeAlertHook,
    clock: DlqClock2 = new SystemDlqClock2()
  ) {
    this._store = store;
    this._hook = hook;
    this._clock = clock;
  }

  /** Add a threshold for a queue (sorted insert; duplicates ignored). */
  watch(queue: string, threshold: SizeThreshold): void {
    if (threshold.depth < 0) throw new Error('threshold depth must be >= 0');
    const list = this._thresholds.get(queue) ?? [];
    if (list.some((t) => t.depth === threshold.depth)) return;
    const i = list.findIndex((t) => t.depth > threshold.depth);
    if (i === -1) list.push(threshold);
    else list.splice(i, 0, threshold);
    this._thresholds.set(queue, list);
  }

  unwatch(queue: string, depth: number): boolean {
    const list = this._thresholds.get(queue);
    if (!list) return false;
    const i = list.findIndex((t) => t.depth === depth);
    if (i === -1) return false;
    list.splice(i, 1);
    this._above.get(queue)?.delete(depth);
    return true;
  }

  /** Live backlog depth (pending + in-flight replay claims). */
  depth(queue: string): number {
    return (
      this._store.depth(queue, 'pending') + this._store.depth(queue, 'replaying')
    );
  }

  /**
   * Evaluate one queue; fires the hook for each threshold whose
   * crossing state changes. Returns the alerts produced (also sent to
   * the hook) so tests and callers can inspect without intercepting.
   */
  check(queue: string): SizeAlert[] {
    const thresholds = this._thresholds.get(queue);
    if (!thresholds || thresholds.length === 0) return [];
    const depth = this.depth(queue);
    const above = this._above.get(queue) ?? new Set<number>();
    const alerts: SizeAlert[] = [];
    const now = this._clock.now();
    for (const t of thresholds) {
      const isAbove = depth >= t.depth;
      const wasAbove = above.has(t.depth);
      if (isAbove && !wasAbove) {
        above.add(t.depth);
        const alert: SizeAlert = {
          queue,
          depth,
          threshold: t,
          entered: true,
          at: now,
        };
        alerts.push(alert);
        this._hook(alert);
      } else if (!isAbove && wasAbove) {
        // Re-arm on the way down; no alert for the drop itself.
        above.delete(t.depth);
      }
    }
    this._above.set(queue, above);
    return alerts;
  }

  /** Sweep every watched queue. */
  poll(): SizeAlert[] {
    const out: SizeAlert[] = [];
    for (const queue of this._thresholds.keys()) out.push(...this.check(queue));
    return out;
  }
}
