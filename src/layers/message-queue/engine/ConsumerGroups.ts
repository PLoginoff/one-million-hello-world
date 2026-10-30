/**
 * ConsumerGroups — per-group offset tracking over the queue's seq space.
 *
 * Model (simplified Kafka):
 *
 *   - Every enqueued message gets a monotonically increasing `seq` — its
 *     "offset" in the queue's logical log.
 *   - A consumer group tracks `position` (next seq to fetch) and
 *     `committed` (highest seq the group has acknowledged as processed).
 *   - `fetch` advances `position`; `commit` advances `committed`. On a
 *     rebalance/crash the group resumes from `committed` — messages between
 *     committed and position are redelivered (at-least-once).
 *
 * Groups are independent: the same queue feeds N groups each with their
 * own cursor — one logical stream, N consumption progressions.
 *
 * @module MessageQueueLayer/Engine
 */

import { GroupOffset, QueueEngineError } from './types';

export class ConsumerGroups {
  /** queue → group → offset state. */
  private readonly offsets = new Map<string, Map<string, GroupOffset>>();
  private readonly clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  /** Joins (or creates) a group for `queue`, starting at `fromSeq`. */
  join(queue: string, group: string, fromSeq = 0): GroupOffset {
    let q = this.offsets.get(queue);
    if (!q) {
      q = new Map();
      this.offsets.set(queue, q);
    }
    let off = q.get(group);
    if (!off) {
      off = { group, position: fromSeq, committed: fromSeq, updatedAt: this.clock() };
      q.set(group, off);
    }
    return off;
  }

  get(queue: string, group: string): GroupOffset | null {
    return this.offsets.get(queue)?.get(group) ?? null;
  }

  /** Records that `group` fetched up to and including `seq`. */
  fetchMark(queue: string, group: string, seq: number): void {
    const off = this.mustGet(queue, group);
    off.position = seq + 1;
    off.updatedAt = this.clock();
  }

  /**
   * Commits `seq` as fully processed. Committed messages are never
   * redelivered to the group — this is the at-least-once boundary.
   */
  commit(queue: string, group: string, seq: number): void {
    const off = this.mustGet(queue, group);
    if (seq >= off.committed) {
      off.committed = seq + 1;
      off.updatedAt = this.clock();
    }
    // Position can't lag behind commit.
    if (off.position < off.committed) off.position = off.committed;
  }

  /** Lag = unconsumed messages between position and the queue tip. */
  lag(queue: string, group: string, tipSeq: number): number {
    const off = this.offsets.get(queue)?.get(group);
    if (!off) return tipSeq;
    return Math.max(0, tipSeq - off.position);
  }

  /** Resets the group's cursor to `fromSeq` (replay). */
  seekTo(queue: string, group: string, fromSeq: number): void {
    const off = this.mustGet(queue, group);
    off.position = fromSeq;
    off.committed = Math.min(off.committed, fromSeq);
    off.updatedAt = this.clock();
  }

  groupsFor(queue: string): string[] {
    return [...(this.offsets.get(queue)?.keys() ?? [])];
  }

  snapshot(queue: string): GroupOffset[] {
    return [...(this.offsets.get(queue)?.values() ?? [])].map((o) => ({ ...o }));
  }

  private mustGet(queue: string, group: string): GroupOffset {
    const off = this.offsets.get(queue)?.get(group);
    if (!off) {
      throw new QueueEngineError(`Group "${group}" has not joined queue "${queue}"`);
    }
    return off;
  }
}
