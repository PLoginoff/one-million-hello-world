/**
 * Priority-based throttle — preferentially admits high-priority work,
 * sheds low-priority load first under contention.
 *
 * Each request carries a priority (lower number = more important, like
 * unix nice). Admission:
 *
 *  - Under capacity → admitted regardless of priority.
 *  - At capacity → admitted iff `priority < threshold`, where threshold
 *    shrinks as load deepens (see {@link PriorityLevels}).
 *  - Queued mode → waiters are dequeued highest-priority-first (stable
 *    within a level — FIFO tie-break).
 *
 * Optional *preemption-by-shedding*: when the queue is full and a
 * higher-priority request arrives than the queue's lowest-priority
 * member, the low-priority waiter is evicted (rejected with
 * `low-priority`) to make room — classic load-shed semantics.
 *
 * @module Throttling/Strategies
 */

import {
  QueueTimeoutError,
  ThrottleMetrics,
  ThrottleRejectedError,
  TimerSource,
  SystemTimerSource,
  TimerHandle,
  emptyMetrics,
} from '../domain/throttle-model';

export interface PriorityLevels {
  /**
   * Cutoffs by queue+inflight pressure. `{ soft: 5, hard: 2 }` means:
   * when utilization ≤ soft% all priorities admitted; soft–hard% only
   * priorities < mid; > hard% only priorities < strict.
   */
  readonly midCutoffPercent?: number;
  readonly strictCutoffPercent?: number;
  /** Priority admitted in the mid band (default 2) and strict band (default 1). */
  readonly midMaxPriority?: number;
  readonly strictMaxPriority?: number;
}

export interface PriorityThrottleOptions {
  readonly maxConcurrent: number;
  readonly maxQueue?: number;
  readonly queueTimeoutMs?: number;
  readonly levels?: PriorityLevels;
  readonly timer?: TimerSource;
}

interface QueuedRequest {
  priority: number;
  enqueuedSeq: number;
  resolve(): void;
  reject(err: Error): void;
  timeoutHandle?: TimerHandle;
}

export class PriorityThrottleStrategy {
  readonly name = 'priority-throttle';

  private readonly _maxConcurrent: number;
  private readonly _maxQueue: number;
  private readonly _queueTimeoutMs: number;
  private readonly _levels: Required<PriorityLevels>;
  private readonly _timer: TimerSource;
  private _inFlight = 0;
  private readonly _queue: QueuedRequest[] = []; // heap-ordered by (priority, seq)
  private _seq = 0;
  private readonly _metrics: ThrottleMetrics = emptyMetrics();

  constructor(options: PriorityThrottleOptions) {
    this._maxConcurrent = options.maxConcurrent;
    this._maxQueue = options.maxQueue ?? Number.POSITIVE_INFINITY;
    this._queueTimeoutMs = options.queueTimeoutMs ?? 0;
    this._timer = options.timer ?? new SystemTimerSource();
    this._levels = {
      midCutoffPercent: options.levels?.midCutoffPercent ?? 60,
      strictCutoffPercent: options.levels?.strictCutoffPercent ?? 85,
      midMaxPriority: options.levels?.midMaxPriority ?? 2,
      strictMaxPriority: options.levels?.strictMaxPriority ?? 1,
    };
  }

  metrics(): ThrottleMetrics {
    return { ...this._metrics, inFlight: this._inFlight, queueDepth: this._queue.length };
  }

  /**
   * Try to run `work` at `priority` (0 = most important). Queued behind
   * in-flight-permit exhaustion; the queue drains highest-priority-first.
   */
  async run<T>(priority: number, work: () => Promise<T> | T): Promise<T> {
    await this._acquire(priority);
    try {
      return await work();
    } finally {
      this._release();
    }
  }

  private _acquire(priority: number): Promise<void> {
    const util = this._utilizationPercent();

    if (this._inFlight < this._maxConcurrent) {
      // Even with free permits, extreme pressure sheds lowest priorities.
      if (!this._admittedAt(util, priority)) {
        this._metrics.rejected++;
        return Promise.reject(
          new ThrottleRejectedError(`priority ${priority} shed at ${util}% utilization`, 'low-priority')
        );
      }
      this._inFlight++;
      this._metrics.admitted++;
      return Promise.resolve();
    }

    // At capacity — strict admission or queue.
    if (!this._admittedAt(util, priority) && this._queue.length === 0) {
      this._metrics.rejected++;
      return Promise.reject(
        new ThrottleRejectedError(`priority ${priority} shed at capacity`, 'low-priority')
      );
    }

    if (this._queue.length >= this._maxQueue) {
      // Try preempting the lowest-priority waiter.
      const tail = this._lowestPriorityWaiter();
      if (tail && priority < tail.priority) {
        this._removeWaiter(tail);
        tail.timeoutHandle?.cancel();
        tail.reject(new ThrottleRejectedError('preempted by higher-priority request', 'low-priority'));
        this._metrics.rejected++;
      } else {
        this._metrics.rejected++;
        return Promise.reject(new ThrottleRejectedError('priority queue full', 'queue-full'));
      }
    }

    this._metrics.queued++;
    return new Promise<void>((resolve, reject) => {
      const req: QueuedRequest = {
        priority,
        enqueuedSeq: this._seq++,
        resolve: () => {
          this._metrics.dequeued++;
          resolve();
        },
        reject,
      };
      if (this._queueTimeoutMs > 0) {
        req.timeoutHandle = this._timer.schedule(this._queueTimeoutMs, () => {
          this._removeWaiter(req);
          this._metrics.timedOut++;
          req.reject(new QueueTimeoutError(this._queueTimeoutMs));
        });
      }
      this._heapPush(req);
    });
  }

  private _release(): void {
    if (this._inFlight <= 0) {
      throw new Error('release without permit');
    }
    const next = this._heapPop();
    if (next) {
      next.timeoutHandle?.cancel();
      next.resolve(); // permit transferred — inFlight unchanged
      return;
    }
    this._inFlight--;
  }

  /** Load-shed admission: at higher utilization only better priorities pass. */
  private _admittedAt(utilPercent: number, priority: number): boolean {
    if (utilPercent >= this._levels.strictCutoffPercent) {
      return priority < this._levels.strictMaxPriority;
    }
    if (utilPercent >= this._levels.midCutoffPercent) {
      return priority < this._levels.midMaxPriority;
    }
    return true;
  }

  private _utilizationPercent(): number {
    const total = this._maxConcurrent + (Number.isFinite(this._maxQueue) ? this._maxQueue : 0);
    if (total <= 0) {
      return 0;
    }
    const used = this._inFlight + this._queue.length;
    return (used / total) * 100;
  }

  private _lowestPriorityWaiter(): QueuedRequest | undefined {
    let worst: QueuedRequest | undefined;
    for (const r of this._queue) {
      if (!worst || r.priority > worst.priority || (r.priority === worst.priority && r.enqueuedSeq > worst.enqueuedSeq)) {
        worst = r;
      }
    }
    return worst;
  }

  private _removeWaiter(r: QueuedRequest): void {
    const idx = this._queue.indexOf(r);
    if (idx >= 0) {
      this._queue.splice(idx, 1);
      this._heapify();
    }
  }

  /* ------- binary min-heap on (priority, seq) — O(log n) push/pop ------- */

  private _heapPush(r: QueuedRequest): void {
    this._queue.push(r);
    let i = this._queue.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this._less(this._queue[i], this._queue[parent])) {
        break;
      }
      [this._queue[i], this._queue[parent]] = [this._queue[parent], this._queue[i]];
      i = parent;
    }
  }

  private _heapPop(): QueuedRequest | undefined {
    if (this._queue.length === 0) {
      return undefined;
    }
    const top = this._queue[0];
    const last = this._queue.pop()!;
    if (this._queue.length > 0) {
      this._queue[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  private _heapify(): void {
    for (let i = (this._queue.length >> 1) - 1; i >= 0; i--) {
      this._siftDown(i);
    }
  }

  private _siftDown(i: number): void {
    const n = this._queue.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this._less(this._queue[l], this._queue[smallest])) {
        smallest = l;
      }
      if (r < n && this._less(this._queue[r], this._queue[smallest])) {
        smallest = r;
      }
      if (smallest === i) {
        break;
      }
      [this._queue[i], this._queue[smallest]] = [this._queue[smallest], this._queue[i]];
      i = smallest;
    }
  }

  /** Order: lower priority number first; ties → earlier enqueued (FIFO). */
  private _less(a: QueuedRequest, b: QueuedRequest): boolean {
    return a.priority !== b.priority ? a.priority < b.priority : a.enqueuedSeq < b.enqueuedSeq;
  }
}
