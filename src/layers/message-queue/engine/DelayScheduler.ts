/**
 * DelayScheduler — min-heap on `deliverAt` for delayed delivery.
 *
 * A timing wheel would also work (O(1) insert, tick-bucket expiry), but a
 * min-heap is the right choice here: message delay distributions are
 * arbitrary (a wheel needs a tick granularity + wheel size tradeoff), and
 * expiry order is strictly monotonic — the heap's O(log n) pop walks the
 * due-prefix in order without advancing a cursor.
 *
 * Operations:
 *   schedule   O(log n)
 *   collectDue O(k log n) for k due items — the heap only pays for what
 *              actually expired; peek is O(1) so idle polls are free.
 *   cancel     O(n) find + O(log n) fix (cancels are rare)
 *
 * @module MessageQueueLayer/Engine
 */

interface DelayedEntry<E> {
  readonly dueAt: number;
  /** FIFO tie-break for identical dueAt values. */
  readonly seq: number;
  readonly item: E;
}

export class DelayScheduler<E> {
  private heap: DelayedEntry<E>[] = [];
  private seq = 0;
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  get size(): number {
    return this.heap.length;
  }

  /** Schedule `item` for `dueAt` (ms epoch). O(log n). */
  schedule(item: E, dueAt: number): void {
    this.heap.push({ dueAt, seq: this.seq++, item });
    this.siftUp(this.heap.length - 1);
  }

  /** Earliest dueAt in the scheduler, or null when empty. O(1). */
  nextDueAt(): number | null {
    return this.heap.length === 0 ? null : this.heap[0].dueAt;
  }

  /**
   * Removes and returns all items due by `now` (defaults to the injected
   * clock). Returned in due order. O(k log n) for k due items.
   */
  collectDue(now = this.clock()): E[] {
    const out: E[] = [];
    while (this.heap.length > 0 && this.heap[0].dueAt <= now) {
      const e = this.popMin();
      if (e !== undefined) out.push(e.item);
    }
    return out;
  }

  /** Peek at the head item without removing. */
  peek(): E | undefined {
    return this.heap[0]?.item;
  }

  /** Cancels the first entry matching `pred`. O(n) find. */
  cancel(pred: (item: E) => boolean): E | undefined {
    const i = this.heap.findIndex((e) => pred(e.item));
    if (i < 0) return undefined;
    const removed = this.heap[i];
    const last = this.heap.pop() as DelayedEntry<E>;
    if (i < this.heap.length) {
      this.heap[i] = last;
      this.siftDown(i);
      this.siftUp(i);
    }
    return removed.item;
  }

  clear(): void {
    this.heap = [];
  }

  // ------------------------------------------------------------------------
  // Min-heap on (dueAt, seq). lt = strictly earlier dueAt, seq breaks ties.
  // ------------------------------------------------------------------------

  private lt(a: DelayedEntry<E>, b: DelayedEntry<E>): boolean {
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt;
    return a.seq < b.seq;
  }

  private popMin(): DelayedEntry<E> | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop() as DelayedEntry<E>;
    if (h.length > 0) {
      h[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number): void {
    const h = this.heap;
    const e = h[i];
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.lt(e, h[p])) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = e;
  }

  private siftDown(i: number): void {
    const h = this.heap;
    const e = h[i];
    const n = h.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < n && this.lt(h[l], h[best])) best = l;
      if (r < n && this.lt(h[r], h[best])) best = r;
      if (best === i) break;
      h[i] = h[best];
      i = best;
    }
    h[i] = e;
  }
}
