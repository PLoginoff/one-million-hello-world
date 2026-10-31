/**
 * FifoSequencer — dedup + per-group ordering for exactly-once FIFO queues.
 *
 * A standard priority/best-effort queue can't give two guarantees real
 * pipelines need:
 *
 *   Exactly-once dedup — a producer retrying after a timeout re-sends the
 *     same message; without dedup the consumer sees it twice. The sequencer
 *     keeps a per-producer `lastSeq` watermark plus a bounded window of
 *     recent message ids: a re-sent seq ≤ watermark is a duplicate and is
 *     dropped (idempotent receive — the SQS FIFO dedup-id model).
 *
 *   Per-group ordering — global FIFO is too strong (serializes unrelated
 *     work); per-GROUP FIFO is the useful one: messages with the same
 *     `groupId` dispatch strictly in order, different groups interleave
 *     freely. Implemented as a buffer that holds out-of-order messages per
 *     group until their predecessors arrive (the classic reorder buffer —
 *     same idea as TCP's receive window).
 *
 * `receive` is the consumer side: it returns the next in-order message for
 * each group, or null while a group is blocked on a gap.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { EngineMessage } from '../types';

/** A message with the sequencing metadata producers attach. */
export interface SequencedMessage<T = unknown> extends EngineMessage<T> {
  /** Producer-assigned sequence number (per producer, monotonic). */
  readonly producerSeq: number;
  /** Ordering group — messages sharing it dispatch in seq order. */
  readonly groupId: string;
  readonly producerId: string;
}

export interface SequencerOptions {
  /** How many recent message-ids to keep for dedup (memory bound). */
  readonly dedupWindow?: number;
}

interface ProducerState {
  lastSeq: number;
  /** Recent seen ids, FIFO-evicted at dedupWindow. */
  seenIds: string[];
}

interface GroupState {
  /** Next producerSeq this group will release. */
  nextExpected: number;
  /** producerSeq → buffered out-of-order message. */
  buffer: Map<number, SequencedMessage<unknown>>;
}

export class FifoSequencer<T = unknown> {
  private readonly dedupWindow: number;
  private readonly producers = new Map<string, ProducerState>();
  private readonly groups = new Map<string, GroupState>();
  private duplicates = 0;
  private reordered = 0;

  constructor(options: SequencerOptions = {}) {
    this.dedupWindow = options.dedupWindow ?? 1_000;
  }

  /**
   * Ingests a message: dedups, then either releases it immediately (it's
   * the group's next expected seq) or buffers it as out-of-order.
   *
   * Returns 'duplicate' | 'released' | 'buffered'.
   */
  ingest(
    msg: SequencedMessage<T>
  ): { result: 'duplicate' | 'released' | 'buffered'; message?: SequencedMessage<T> } {
    // Dedup by (producer, id): a re-send with the same id is dropped.
    const p = this.producers.get(msg.producerId) ?? { lastSeq: -1, seenIds: [] };
    if (!this.producers.has(msg.producerId)) this.producers.set(msg.producerId, p);
    if (p.seenIds.includes(msg.id) || msg.producerSeq <= p.lastSeq) {
      this.duplicates++;
      return { result: 'duplicate' };
    }
    p.seenIds.push(msg.id);
    if (p.seenIds.length > this.dedupWindow) p.seenIds.shift();
    p.lastSeq = Math.max(p.lastSeq, msg.producerSeq);

    // Ordering: is this the group's next expected seq?
    const g = this.groups.get(msg.groupId) ?? { nextExpected: 0, buffer: new Map() };
    if (!this.groups.has(msg.groupId)) this.groups.set(msg.groupId, g);
    if (msg.producerSeq === g.nextExpected) {
      return { result: 'released', message: msg };
    }
    if (msg.producerSeq > g.nextExpected) {
      g.buffer.set(msg.producerSeq, msg as SequencedMessage<unknown>);
      this.reordered++;
      return { result: 'buffered' };
    }
    // producerSeq < nextExpected but passed dedup — stale; treat as dup.
    this.duplicates++;
    return { result: 'duplicate' };
  }

  /**
   * Drains released + newly-unblocked buffered messages for a group: after
   * seq N is released, buffered N+1, N+2, ... become available. The reorder
   * buffer is what makes out-of-order ARRIVAL transparent to consumers.
   */
  receive(groupId: string): SequencedMessage<T>[] {
    const g = this.groups.get(groupId);
    if (!g) return [];
    const out: SequencedMessage<T>[] = [];
    // Pull the contiguous chain from nextExpected upward.
    while (g.buffer.has(g.nextExpected)) {
      const m = g.buffer.get(g.nextExpected) as SequencedMessage<T>;
      g.buffer.delete(g.nextExpected);
      out.push(m);
      g.nextExpected++;
    }
    return out;
  }

  /**
   * Whether `receive` should be called: true when an ingest just released
   * message N, because that may unblock buffered N+1... in the same call.
   * `ingest` returning 'released' means the caller can `receive` now.
   */
  hasPending(groupId: string): boolean {
    const g = this.groups.get(groupId);
    return g !== undefined && g.buffer.has(g.nextExpected);
  }

  /** Gap size: how many seq numbers a group is waiting on. */
  gap(groupId: string): number {
    const g = this.groups.get(groupId);
    if (!g) return 0;
    const buffered = [...g.buffer.keys()];
    if (buffered.length === 0) return 0;
    return Math.max(...buffered) - g.nextExpected + 1 - buffered.length;
  }

  get stats(): { duplicates: number; reordered: number; producers: number; groups: number } {
    return {
      duplicates: this.duplicates,
      reordered: this.reordered,
      producers: this.producers.size,
      groups: this.groups.size,
    };
  }
}
