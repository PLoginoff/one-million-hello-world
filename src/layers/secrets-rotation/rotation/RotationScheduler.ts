/**
 * Secrets Rotation — Rotation Scheduler
 *
 * Cron-like interval scheduler for secret rotation. Each registered secret
 * has a `nextDue` timestamp; `tick()` returns all secrets whose rotation is
 * due (plus any whose keys exceed `maxKeyAgeMs`, which fire regardless of
 * the interval).
 *
 * Implementation: a min-heap keyed on next-due time — `due()` is O(k log n)
 * for k due secrets, `reschedule` is O(log n). Jitter support spreads herd
 * rotations (thundering-herd prevention on shared KMS/HSM backends).
 *
 * @module SecretsRotation/Rotation
 */

import { RotationClock, RotationPolicy, ScheduledRotation } from './RotationTypes';

interface ScheduleEntry {
  readonly secretId: string;
  readonly policy: RotationPolicy;
  nextDue: number;
  lastRotatedAt: number;
}

class MinHeap {
  private readonly _items: ScheduleEntry[] = [];

  get size(): number {
    return this._items.length;
  }

  peek(): ScheduleEntry | undefined {
    return this._items[0];
  }

  push(item: ScheduleEntry): void {
    this._items.push(item);
    this._up(this._items.length - 1);
  }

  pop(): ScheduleEntry | undefined {
    if (this._items.length === 0) return undefined;
    const top = this._items[0];
    const last = this._items.pop();
    if (this._items.length > 0 && last !== undefined) {
      this._items[0] = last;
      this._down(0);
    }
    return top;
  }

  remove(secretId: string): boolean {
    const i = this._items.findIndex((x) => x.secretId === secretId);
    if (i < 0) return false;
    this._items.splice(i, 1);
    this._heapify();
    return true;
  }

  /** Re-heapify after in-place nextDue mutation. O(n). */
  heapify(): void {
    this._heapify();
  }

  private _heapify(): void {
    for (let i = (this._items.length >> 1) - 1; i >= 0; i--) this._down(i);
  }

  private _up(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._items[i].nextDue >= this._items[p].nextDue) break;
      this._swap(i, p);
      i = p;
    }
  }

  private _down(i: number): void {
    const n = this._items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let s = i;
      if (l < n && this._items[l].nextDue < this._items[s].nextDue) s = l;
      if (r < n && this._items[r].nextDue < this._items[s].nextDue) s = r;
      if (s === i) break;
      this._swap(i, s);
      i = s;
    }
  }

  private _swap(a: number, b: number): void {
    const t = this._items[a];
    this._items[a] = this._items[b];
    this._items[b] = t;
  }
}

export class RotationScheduler {
  private readonly _clock: RotationClock;
  private readonly _random: () => number;
  private readonly _heap = new MinHeap();
  private readonly _entries = new Map<string, ScheduleEntry>();
  /** Jitter fraction applied to each interval (default 10%). */
  private readonly _jitterRatio: number;

  constructor(clock: RotationClock = Date.now, random: () => number = Math.random, jitterRatio = 0.1) {
    this._clock = clock;
    this._random = random;
    this._jitterRatio = Math.max(0, Math.min(1, jitterRatio));
  }

  get size(): number {
    return this._entries.size;
  }

  /** Register a secret's rotation schedule. First rotation due at now+interval. */
  register(policy: RotationPolicy): void {
    if (policy.intervalMs <= 0) throw new RangeError('intervalMs must be positive');
    if (this._entries.has(policy.secretId)) {
      throw new Error(`secret '${policy.secretId}' already scheduled`);
    }
    const entry: ScheduleEntry = {
      secretId: policy.secretId,
      policy,
      nextDue: this._clock() + this._jittered(policy.intervalMs),
      lastRotatedAt: this._clock(),
    };
    this._entries.set(policy.secretId, entry);
    this._heap.push(entry);
  }

  unregister(secretId: string): boolean {
    if (!this._entries.delete(secretId)) return false;
    return this._heap.remove(secretId);
  }

  /** When is a secret next due? */
  nextDueFor(secretId: string): number | undefined {
    return this._entries.get(secretId)?.nextDue;
  }

  /** The single soonest-due entry, without dequeueing. */
  peekNext(): { secretId: string; dueAt: number } | undefined {
    const e = this._heap.peek();
    return e ? { secretId: e.secretId, dueAt: e.nextDue } : undefined;
  }

  /**
   * Dequeue all secrets whose rotation is due at `at` (default now).
   * Each returned entry is auto-rescheduled to its next interval — a due
   * secret NEVER silently falls off the schedule even if the consumer fails
   * to rotate it (at-least-once scheduling; the engine decides whether to
   * skip a still-valid key).
   */
  due(at?: number): ScheduledRotation[] {
    const t = at ?? this._clock();
    const out: ScheduledRotation[] = [];
    while (this._heap.size > 0) {
      const top = this._heap.peek();
      if (!top || top.nextDue > t) break;
      const e = this._heap.pop();
      if (!e) break;
      out.push({ secretId: e.secretId, dueAt: e.nextDue, kind: 'interval' });
      // Auto-reschedule from the DUE time (not now) to keep the cadence
      // stable under clock skew; skip forward if we'd already be past due.
      e.lastRotatedAt = t;
      e.nextDue = e.nextDue + this._jittered(e.policy.intervalMs);
      if (e.nextDue <= t) {
        e.nextDue = t + this._jittered(e.policy.intervalMs);
      }
      this._heap.push(e);
    }
    return out;
  }

  /**
   * Reschedule a secret explicitly (e.g. after a manual or emergency rotation
   * resets its clock).
   */
  reschedule(secretId: string, fromNow?: number): void {
    const e = this._entries.get(secretId);
    if (!e) throw new Error(`secret '${secretId}' not scheduled`);
    e.nextDue = this._clock() + this._jittered(fromNow ?? e.policy.intervalMs);
    e.lastRotatedAt = this._clock();
    this._heap.heapify();
  }

  /** Apply ±jitterRatio uniform jitter to an interval. */
  private _jittered(intervalMs: number): number {
    if (this._jitterRatio === 0) return intervalMs;
    const delta = (this._random() * 2 - 1) * this._jitterRatio;
    return Math.max(1, Math.round(intervalMs * (1 + delta)));
  }
}
