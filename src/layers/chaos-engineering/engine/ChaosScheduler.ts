/**
 * Chaos Engineering — Experiment Scheduler & Safety Windows
 *
 * Schedules experiments to run only inside permitted "safety windows" and
 * never inside blackout windows. Scheduling is a min-heap ordered by
 * scheduled start time, so `nextDue()` and `due()` are O(log n) / O(k log n).
 *
 * Admission rules (checked in order):
 *   1. Time inside ANY blackout window          → rejected
 *   2. Non-empty allow-list & time outside all  → rejected
 *   3. Concurrent experiment cap reached        → deferred (stays queued)
 *   4. Otherwise                                → admitted
 *
 * The scheduler never auto-runs anything: `due()` hands admitted, due
 * experiments to a caller-supplied launcher so the engine keeps full control
 * of execution timing.
 *
 * @module ChaosEngineering/Engine
 */

import { ChaosClock, ChaosExperimentDefinition, SafetyWindow } from './ChaosEngineTypes';

export interface ScheduledExperiment {
  readonly scheduleId: string;
  readonly definition: ChaosExperimentDefinition;
  /** Earliest permitted start (epoch ms). */
  readonly notBefore: number;
  /** Latest permitted start; after this the entry is dropped as expired. */
  readonly notAfter?: number;
  /** Cron-like recurrence: re-queue every `recurrenceMs` after a run. */
  readonly recurrenceMs?: number;
}

export type AdmissionVerdict =
  | { readonly admitted: true }
  | { readonly admitted: false; readonly reason: string; readonly deferred: boolean };

/**
 * Binary min-heap keyed on `notBefore`. Standard sift-up/sift-down;
 * push/pop O(log n), peek O(1).
 */
class MinHeap<T> {
  private readonly _items: T[] = [];
  private readonly _key: (item: T) => number;

  constructor(key: (item: T) => number) {
    this._key = key;
  }

  get size(): number {
    return this._items.length;
  }

  peek(): T | undefined {
    return this._items[0];
  }

  push(item: T): void {
    this._items.push(item);
    this._siftUp(this._items.length - 1);
  }

  pop(): T | undefined {
    if (this._items.length === 0) return undefined;
    const top = this._items[0];
    const last = this._items.pop();
    if (this._items.length > 0 && last !== undefined) {
      this._items[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  remove(predicate: (item: T) => boolean): number {
    let removed = 0;
    for (let i = this._items.length - 1; i >= 0; i--) {
      if (predicate(this._items[i])) {
        this._items.splice(i, 1);
        removed++;
      }
    }
    // splice breaks heap order; re-heapify when we removed interior nodes.
    if (removed > 0) this._heapify();
    return removed;
  }

  toArray(): ReadonlyArray<T> {
    return [...this._items];
  }

  private _siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._key(this._items[i]) >= this._key(this._items[parent])) break;
      this._swap(i, parent);
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this._items.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this._key(this._items[l]) < this._key(this._items[smallest])) smallest = l;
      if (r < n && this._key(this._items[r]) < this._key(this._items[smallest])) smallest = r;
      if (smallest === i) break;
      this._swap(i, smallest);
      i = smallest;
    }
  }

  private _heapify(): void {
    for (let i = (this._items.length >> 1) - 1; i >= 0; i--) this._siftDown(i);
  }

  private _swap(a: number, b: number): void {
    const t = this._items[a];
    this._items[a] = this._items[b];
    this._items[b] = t;
  }
}

export class ChaosScheduler {
  private readonly _clock: ChaosClock;
  private readonly _windows: SafetyWindow[] = [];
  private readonly _queue = new MinHeap<ScheduledExperiment>((e) => e.notBefore);
  private readonly _byId = new Map<string, ScheduledExperiment>();
  private _maxConcurrent: number;
  private _running = 0;

  constructor(clock: ChaosClock = Date.now, maxConcurrent = 1) {
    this._clock = clock;
    this._maxConcurrent = maxConcurrent;
  }

  get queuedCount(): number {
    return this._queue.size;
  }

  get runningCount(): number {
    return this._running;
  }

  setMaxConcurrent(n: number): void {
    if (n < 1) throw new RangeError('maxConcurrent must be ≥ 1');
    this._maxConcurrent = n;
  }

  /** Register a safety window (allow window) or blackout window. */
  addWindow(window: SafetyWindow): void {
    if (window.endsAt <= window.startsAt) {
      throw new RangeError(`window '${window.name}': endsAt must be after startsAt`);
    }
    this._windows.push(window);
    this._windows.sort((a, b) => a.startsAt - b.startsAt);
  }

  clearWindows(): void {
    this._windows.length = 0;
  }

  get windows(): ReadonlyArray<SafetyWindow> {
    return this._windows;
  }

  /**
   * Is `at` (default now) inside a permitted execution window? True when the
   * time is outside every blackout AND (no allow-list exists OR inside ≥1
   * allow window).
   */
  isPermitted(at?: number): boolean {
    const t = at ?? this._clock();
    let hasAllow = false;
    let inAllow = false;
    for (const w of this._windows) {
      const inside = t >= w.startsAt && t < w.endsAt;
      if (w.blackout) {
        if (inside) return false;
      } else {
        hasAllow = true;
        if (inside) inAllow = true;
      }
    }
    return !hasAllow || inAllow;
  }

  /** Next epoch-ms when scheduling becomes permitted, or null if never. */
  nextPermittedAfter(at?: number): number | null {
    const t = at ?? this._clock();
    if (this.isPermitted(t)) return t;
    // The next boundary that could flip the verdict is the earliest window
    // start or blackout end after t. Scan and take the minimum candidate
    // that is itself permitted.
    const candidates: number[] = [];
    for (const w of this._windows) {
      if (w.startsAt > t) candidates.push(w.startsAt);
      if (w.blackout && t >= w.startsAt && t < w.endsAt) candidates.push(w.endsAt);
    }
    candidates.sort((a, b) => a - b);
    for (const c of candidates) {
      if (this.isPermitted(c)) return c;
    }
    return null;
  }

  /** Queue an experiment for execution at/after `entry.notBefore`. */
  schedule(entry: ScheduledExperiment): void {
    if (this._byId.has(entry.scheduleId)) {
      throw new Error(`schedule '${entry.scheduleId}' already exists`);
    }
    this._byId.set(entry.scheduleId, entry);
    this._queue.push(entry);
  }

  cancel(scheduleId: string): boolean {
    if (!this._byId.delete(scheduleId)) return false;
    this._queue.remove((e) => e.scheduleId === scheduleId);
    return true;
  }

  /**
   * Check a single entry's admission at a given time — used by tests and by
   * `due()` before dequeueing.
   */
  admit(entry: ScheduledExperiment, at?: number): AdmissionVerdict {
    const t = at ?? this._clock();
    if (!this.isPermitted(t)) {
      return { admitted: false, reason: 'outside safety window / inside blackout', deferred: true };
    }
    if (this._running >= this._maxConcurrent) {
      return { admitted: false, reason: `concurrency cap ${this._maxConcurrent} reached`, deferred: true };
    }
    return { admitted: true };
  }

  /**
   * Dequeue all entries that are due AND admitted. Expired entries
   * (notAfter < now) are dropped. Deferred entries stay queued — they are
   * re-pushed with their original notBefore so ordering is stable.
   */
  due(at?: number): ScheduledExperiment[] {
    const t = at ?? this._clock();
    const admitted: ScheduledExperiment[] = [];
    const deferred: ScheduledExperiment[] = [];

    while (this._queue.size > 0) {
      const next = this._queue.peek();
      if (!next || next.notBefore > t) break;
      const entry = this._queue.pop();
      if (!entry) break;
      this._byId.delete(entry.scheduleId);

      if (entry.notAfter !== undefined && entry.notAfter < t) {
        continue; // expired — drop
      }
      const verdict = this.admit(entry, t);
      if (verdict.admitted) {
        admitted.push(entry);
        this._running++;
      } else if (verdict.deferred) {
        deferred.push(entry);
      }
    }

    for (const e of deferred) {
      this._byId.set(e.scheduleId, e);
      this._queue.push(e);
    }
    return admitted;
  }

  /** Mark a previously-admitted experiment as finished (frees a slot). */
  complete(entry: ScheduledExperiment): void {
    this._running = Math.max(0, this._running - 1);
    if (entry.recurrenceMs !== undefined && entry.recurrenceMs > 0) {
      const next: ScheduledExperiment = {
        ...entry,
        notBefore: this._clock() + entry.recurrenceMs,
      };
      this._byId.set(next.scheduleId, next);
      this._queue.push(next);
    }
  }

  /** Peek the next queued entry without dequeueing. */
  peekNext(): ScheduledExperiment | undefined {
    return this._queue.peek();
  }
}
