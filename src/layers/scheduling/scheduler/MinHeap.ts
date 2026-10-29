/**
 * Min-Heap Priority Queue
 *
 * Binary heap over (fireAt, -priority, seq) tuples — jobs pop in
 * chronological order, ties broken by higher priority then FIFO.
 *
 * push / pop are O(log n); peek is O(1). The scheduler pops all jobs whose
 * fireAt ≤ now, then pushes them back with their next fire time.
 *
 * @module SchedulingLayer/Scheduler
 */

export interface HeapEntry {
  readonly jobId: string;
  /** When this job is next due (epoch ms). */
  fireAt: number;
  /** Higher = runs first on a tie. */
  readonly priority: number;
  /** Insertion sequence — FIFO tie-break. */
  readonly seq: number;
}

export class JobQueue {
  private _heap: HeapEntry[] = [];
  private _seq = 0;

  get size(): number {
    return this._heap.length;
  }

  peek(): HeapEntry | null {
    return this._heap[0] ?? null;
  }

  push(jobId: string, fireAt: number, priority = 0): HeapEntry {
    const e: HeapEntry = { jobId, fireAt, priority, seq: this._seq++ };
    this._heap.push(e);
    this._bubbleUp(this._heap.length - 1);
    return e;
  }

  /**
   * Pop the earliest entry, or null when empty.
   */
  pop(): HeapEntry | null {
    const top = this._heap[0];
    if (top === undefined) return null;
    const last = this._heap.pop()!;
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  /**
   * Pop every entry with fireAt ≤ t, in order.
   */
  popDue(t: number): HeapEntry[] {
    const out: HeapEntry[] = [];
    while (this._heap.length > 0 && this._heap[0].fireAt <= t) {
      out.push(this.pop()!);
    }
    return out;
  }

  /**
   * Remove all entries for a job (e.g. unschedule). O(n) — fine for the
   * sizes a scheduler sees.
   */
  removeJob(jobId: string): number {
    const before = this._heap.length;
    this._heap = this._heap.filter((e) => e.jobId !== jobId);
    // Reheapify after bulk removal.
    for (let i = Math.floor(this._heap.length / 2) - 1; i >= 0; i--) {
      this._bubbleDown(i);
    }
    return before - this._heap.length;
  }

  /**
   * Replace a job's queue position after its next fire time changes.
   */
  reschedule(jobId: string, fireAt: number, priority = 0): void {
    this.removeJob(jobId);
    this.push(jobId, fireAt, priority);
  }

  // ordering: earliest fireAt → higher priority → lower seq
  private _less(a: HeapEntry, b: HeapEntry): boolean {
    if (a.fireAt !== b.fireAt) return a.fireAt < b.fireAt;
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.seq < b.seq;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this._less(this._heap[i], this._heap[p])) break;
      [this._heap[i], this._heap[p]] = [this._heap[p], this._heap[i]];
      i = p;
    }
  }

  private _bubbleDown(i: number): void {
    const n = this._heap.length;
    for (;;) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = l + 1;
      if (l < n && this._less(this._heap[l], this._heap[smallest])) smallest = l;
      if (r < n && this._less(this._heap[r], this._heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this._heap[i], this._heap[smallest]] = [this._heap[smallest], this._heap[i]];
      i = smallest;
    }
  }
}
