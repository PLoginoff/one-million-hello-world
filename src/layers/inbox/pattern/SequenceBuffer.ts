/**
 * SequenceBuffer — reorder window for ordered consumers.
 *
 * Buffers records that arrive ahead of their expected sequence so the
 * engine can deliver them in order once predecessors land. Implemented
 * as a min-heap keyed on sequence, which gives:
 *
 *   push  O(log n)   peek  O(1)   pop-ready  O(log n) per drained record
 *
 * A bounded window (`capacity`) mirrors real reorder buffers: beyond
 * capacity the oldest-by-arrival record is dropped into an overflow
 * list the caller can surface as "late/lost" for operators.
 *
 * @module Inbox/Pattern
 */

import { InboxRecord } from './types';

/** Min-heap on sequence (ties broken by receivedAt). */
export class SequenceBuffer {
  private readonly _heap: InboxRecord[] = [];
  private readonly _capacity: number;
  private readonly _overflow: InboxRecord[] = [];

  constructor(capacity = 1_000) {
    this._capacity = capacity;
  }

  /** Insert a record. Over-capacity records go to the overflow list. */
  push(record: InboxRecord): void {
    if (this._heap.length >= this._capacity) {
      this._overflow.push(record);
      return;
    }
    this._heap.push(record);
    this._siftUp(this._heap.length - 1);
  }

  /** Smallest-sequence record, or undefined. */
  peek(): InboxRecord | undefined {
    return this._heap[0];
  }

  /**
   * Drain every record whose sequence is `nextExpected` or which would
   * fill a contiguous run starting there. Returns records in sequence
   * order and the new expected sequence.
   */
  drainContiguous(nextExpected: number): { drained: InboxRecord[]; next: number } {
    const drained: InboxRecord[] = [];
    let next = nextExpected;
    while (this._heap.length > 0) {
      const top = this._heap[0];
      const seq = top.sequence ?? next;
      if (seq > next) break;
      drained.push(this._pop());
      if (seq === next) next++;
      // seq < next (duplicate/late): drain but don't move the pointer
    }
    return { drained, next };
  }

  /** Records that overflowed the window (operator attention). */
  overflow(): InboxRecord[] {
    return [...this._overflow];
  }

  size(): number {
    return this._heap.length;
  }

  isEmpty(): boolean {
    return this._heap.length === 0;
  }

  // ---- heap internals -------------------------------------------------

  private _less(a: InboxRecord, b: InboxRecord): boolean {
    const sa = a.sequence ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sequence ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa < sb;
    return a.receivedAt < b.receivedAt;
  }

  private _siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this._less(this._heap[i], this._heap[parent])) break;
      [this._heap[i], this._heap[parent]] = [this._heap[parent], this._heap[i]];
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this._heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this._less(this._heap[l], this._heap[smallest])) smallest = l;
      if (r < n && this._less(this._heap[r], this._heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this._heap[i], this._heap[smallest]] = [this._heap[smallest], this._heap[i]];
      i = smallest;
    }
  }

  private _pop(): InboxRecord {
    const top = this._heap[0];
    const last = this._heap.pop()!;
    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }
    return top;
  }
}
