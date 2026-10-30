/**
 * Consumer Group Coordinator
 *
 * Partitioned queue consumption across a worker pool — the "K" in
 * Kafka. Members join a group on a queue; the coordinator hands each
 * member a distinct slice of the queue's partitions (message hashes)
 * so no two consumers see the same message.
 *
 * Assignment is range-style: partitions sorted by index, dealt
 * round-robin to members — stable for a fixed member set so a member
 * that keeps its partitions sees its backlog continuously. Joins and
 * leaves trigger a full rebalance: the new assignment is computed
 * wholesale and each member's delta is reported, mirroring Kafka's
 * eager rebalancing (simple, correct, and the right choice when the
 * set is small).
 *
 * Messages route to a partition by hashing a grouping key (the
 * aggregate/session id) with FNV-1a — stable across rebalances, cheap
 * O(len), no crypto needed (this is routing, not signing).
 *
 * @module MessageBusLayer/Engine2
 */

/** FNV-1a 32-bit hash, unsigned — the partition-selection function. */
function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) | 0) + ((h << 4) | 0) + ((h << 7) | 0) + ((h << 8) | 0) + ((h << 24) | 0)) | 0;
  }
  return h >>> 0;
}

export class ConsumerGroupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsumerGroupError';
  }
}

export interface Assignment {
  readonly memberId: string;
  readonly partitions: readonly number[];
}

export interface RebalanceResult {
  /** Members whose partition set changed. */
  readonly changed: readonly string[];
  readonly assignments: ReadonlyMap<string, readonly number[]>;
  /** Partitions that gained a new owner. */
  readonly moves: ReadonlyArray<{ partition: number; from: string | null; to: string }>;
}

export class ConsumerGroup {
  readonly name: string;
  private readonly _partitionCount: number;
  private readonly _members = new Map<string, { joinedAt: number }>();
  /** Current assignment: partition → member. */
  private readonly _assignment = new Map<number, string>();
  private _joinSeq = 0;

  constructor(name: string, partitionCount: number) {
    if (!Number.isInteger(partitionCount) || partitionCount <= 0) {
      throw new ConsumerGroupError(`partitionCount must be a positive integer`);
    }
    this.name = name;
    this._partitionCount = partitionCount;
  }

  get memberCount(): number {
    return this._members.size;
  }

  get partitions(): number {
    return this._partitionCount;
  }

  /** Which partition a message key lands on — stable across rebalances. */
  partitionFor(key: string): number {
    return fnv1a32(key) % this._partitionCount;
  }

  /** Join the group; triggers a rebalance. */
  join(memberId: string): RebalanceResult {
    if (this._members.has(memberId)) {
      throw new ConsumerGroupError(`member '${memberId}' already in group '${this.name}'`);
    }
    this._members.set(memberId, { joinedAt: ++this._joinSeq });
    return this._rebalance();
  }

  /** Leave; the member's partitions redistribute to survivors. */
  leave(memberId: string): RebalanceResult {
    if (!this._members.delete(memberId)) {
      throw new ConsumerGroupError(`member '${memberId}' not in group '${this.name}'`);
    }
    return this._rebalance();
  }

  /** Current partition→member map, read-only. */
  assignments(): ReadonlyMap<number, string> {
    return new Map(this._assignment);
  }

  /** A member's partition set. */
  memberPartitions(memberId: string): readonly number[] {
    if (!this._members.has(memberId)) {
      throw new ConsumerGroupError(`member '${memberId}' not in group '${this.name}'`);
    }
    return [...this._assignment.entries()]
      .filter(([, m]) => m === memberId)
      .map(([p]) => p)
      .sort((a, b) => a - b);
  }

  /**
   * Range-style rebalance: partitions sorted by index dealt round-
   * robin to join-ordered members. Deterministic — the same member set
   * and partition count always produces the same map.
   */
  private _rebalance(): RebalanceResult {
    const members = [...this._members.keys()].sort();
    const next = new Map<number, string>();
    if (members.length > 0) {
      for (let p = 0; p < this._partitionCount; p++) {
        const m = members[p % members.length];
        if (m !== undefined) next.set(p, m);
      }
    }
    const changed = new Set<string>();
    const moves: Array<{ partition: number; from: string | null; to: string }> = [];
    for (const [p, m] of next) {
      const prev = this._assignment.get(p) ?? null;
      if (prev !== m) {
        moves.push({ partition: p, from: prev, to: m });
        if (prev !== null) changed.add(prev);
        changed.add(m);
      }
    }
    // Members whose entire set vanished (e.g. member count > partitions).
    for (const m of members) {
      const hasAny = [...next.values()].includes(m);
      if (!hasAny) changed.add(m);
    }
    this._assignment.clear();
    for (const [p, m] of next) this._assignment.set(p, m);
    return {
      changed: [...changed],
      assignments: new Map(
        members.map((m) => [m, this.memberPartitions(m)])
      ),
      moves,
    };
  }
}
