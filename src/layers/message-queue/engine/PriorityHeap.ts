/**
 * PriorityHeap — binary max-heap with stable FIFO ties.
 *
 * Structure: dense array `heap[]` where node i's children are 2i+1 / 2i+2.
 * Ordering key is (priority, seq): higher priority pops first; equal
 * priorities pop in enqueue order — the "stable" part that a naive
 * heap does NOT give (heap property alone is non-deterministic on ties).
 *
 * Operations:
 *   push   O(log n) sift-up
 *   pop    O(log n) sift-down (or O(1) for the last element)
 *   peek   O(1)
 *   size   O(1)
 *
 * Why a heap and not a sorted array: enqueue bursts are O(log n) each
 * vs O(n) insertion into a sorted array; dequeue is the same O(log n).
 * Real brokers (RabbitMQ priority queues) use the same structure.
 *
 * @module MessageQueueLayer/Engine
 */

interface HeapEntry<E> {
  /** Ordering fields — kept parallel to the payload so swap stays cheap. */
  readonly priority: number;
  readonly seq: number;
  readonly item: E;
}

export class PriorityHeap<E> {
  private heap: HeapEntry<E>[] = [];

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /** Insert. O(log n). */
  push(item: E, priority: number, seq: number): void {
    this.heap.push({ priority, seq, item });
    this.siftUp(this.heap.length - 1);
  }

  /** Highest-priority (then oldest-seq) element, without removing. O(1). */
  peek(): E | undefined {
    return this.heap.length === 0 ? undefined : this.heap[0].item;
  }

  /** Remove and return the top element. O(log n). */
  pop(): E | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0];
    const last = h.pop() as HeapEntry<E>;
    if (h.length > 0) {
      h[0] = last;
      this.siftDown(0);
    }
    return top.item;
  }

  /** Removes the first element matching `pred`. O(n) find + O(log n) fix. */
  remove(pred: (item: E) => boolean): E | undefined {
    const i = this.heap.findIndex((e) => pred(e.item));
    if (i < 0) return undefined;
    const removed = this.heap[i];
    const last = this.heap.pop() as HeapEntry<E>;
    if (i < this.heap.length) {
      this.heap[i] = last;
      // Replacement can need either direction — fix both ways.
      this.siftDown(i);
      this.siftUp(i);
    }
    return removed.item;
  }

  /** Iterates a snapshot in pop order (drains a copy). O(n log n). */
  drain(): E[] {
    const out: E[] = [];
    while (this.heap.length > 0) {
      const v = this.pop();
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  /** Snapshot in heap order (not sorted — internal layout). */
  toArray(): E[] {
    return this.heap.map((e) => e.item);
  }

  clear(): void {
    this.heap = [];
  }

  // ------------------------------------------------------------------------
  // Heap maintenance. `gt(a,b)` = a should sit closer to the root than b.
  // ------------------------------------------------------------------------

  private gt(a: HeapEntry<E>, b: HeapEntry<E>): boolean {
    if (a.priority !== b.priority) return a.priority > b.priority;
    return a.seq < b.seq; // stable: earlier enqueue wins ties
  }

  private siftUp(i: number): void {
    const h = this.heap;
    const e = h[i];
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.gt(e, h[parent])) break;
      h[i] = h[parent];
      i = parent;
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
      if (l < n && this.gt(h[l], h[best])) best = l;
      if (r < n && this.gt(h[r], h[best])) best = r;
      if (best === i) break;
      h[i] = h[best];
      i = best;
    }
    h[i] = e;
  }
}
