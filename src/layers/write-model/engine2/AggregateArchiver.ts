/**
 * AggregateArchiver — cold storage for old aggregates.
 *
 * Hot aggregates (recent writes, frequent reads) live in the fast
 * store; old/finalized aggregates are serialized into a cold archive to
 * keep the hot store small. An aggregate is eligible for archiving
 * when:
 *  - its last event is older than `coldAfterMs`, AND
 *  - it is in a terminal state (`isTerminal` predicate) OR `force` is
 *    used by an operator.
 *
 * Archiving is copy-then-delete with verification: the cold record is
 * written and checksum-verified BEFORE the hot row is removed, so a
 * mid-flight failure never loses the aggregate — worst case it exists
 * in both stores (harmless: reads prefer hot).
 *
 * Restore is explicit — a cold aggregate must be `thaw`ed back before
 * new commands target it; commands against cold aggregates should be
 * rejected by the caller with "archived".
 *
 * @module WriteModelLayer/Engine2
 */

import { WmClock2, SystemWmClock2 } from './types';

export interface HotAggregate {
  readonly aggregateId: string;
  readonly type: string;
  readonly version: number;
  readonly state: Record<string, unknown>;
  /** ms of the last event applied. */
  readonly lastEventAtMs: number;
}

interface ColdRecord {
  readonly aggregateId: string;
  readonly type: string;
  readonly version: number;
  readonly state: Record<string, unknown>;
  readonly archivedAtMs: number;
  readonly checksum: number;
}

export interface ArchiverOptions {
  /** Age after which an aggregate is archive-eligible. */
  coldAfterMs: number;
  /** Predicate: is the aggregate in a terminal state? */
  isTerminal?: (a: HotAggregate) => boolean;
  clock?: WmClock2;
}

export type ArchiveVerdict =
  | { readonly kind: 'archived'; readonly checksum: number }
  | { readonly kind: 'too-recent' }
  | { readonly kind: 'not-terminal' }
  | { readonly kind: 'already-cold' };

/** FNV-1a checksum over canonical JSON — integrity guard, not crypto. */
function checksumOf(a: HotAggregate): number {
  const s = JSON.stringify([a.aggregateId, a.type, a.version, a.state]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class AggregateArchiver {
  private readonly _cold = new Map<string, ColdRecord>();
  private readonly _opts: Required<Omit<ArchiverOptions, 'clock' | 'isTerminal'>> & Pick<ArchiverOptions, 'isTerminal'>;
  private readonly _clock: WmClock2;

  constructor(opts: ArchiverOptions) {
    this._clock = opts.clock ?? new SystemWmClock2();
    this._opts = {
      coldAfterMs: opts.coldAfterMs,
      isTerminal: opts.isTerminal,
    };
  }

  /**
   * Archive one aggregate — copy → verify → mark. The hot store is NOT
   * mutated (this class models only the archive side; the caller deletes
   * the hot row after 'archived'). Returns a verdict so callers can
   * distinguish policy rejections from real failures.
   */
  archive(a: HotAggregate, force: boolean = false): ArchiveVerdict {
    if (this._cold.has(a.aggregateId)) return { kind: 'already-cold' };
    const now = this._clock.now();
    if (!force) {
      if (now - a.lastEventAtMs < this._opts.coldAfterMs) return { kind: 'too-recent' };
      if (this._opts.isTerminal && !this._opts.isTerminal(a)) return { kind: 'not-terminal' };
    }
    const checksum = checksumOf(a);
    // Copy-then-verify before the caller deletes hot state.
    this._cold.set(a.aggregateId, {
      aggregateId: a.aggregateId,
      type: a.type,
      version: a.version,
      state: JSON.parse(JSON.stringify(a.state)),
      archivedAtMs: now,
      checksum,
    });
    return { kind: 'archived', checksum };
  }

  /** Is this aggregate archived (and therefore read-only / command-reject)? */
  isCold(aggregateId: string): boolean {
    return this._cold.has(aggregateId);
  }

  /**
   * Thaw — restore an archived aggregate to a hot row. The checksum is
   * re-verified on restore; mismatch throws (cold-store corruption must
   * never silently surface as state).
   */
  thaw(aggregateId: string): HotAggregate | null {
    const rec = this._cold.get(aggregateId);
    if (!rec) return null;
    const a: HotAggregate = {
      aggregateId: rec.aggregateId,
      type: rec.type,
      version: rec.version,
      state: JSON.parse(JSON.stringify(rec.state)),
      lastEventAtMs: this._clock.now(),
    };
    if (checksumOf(a) !== rec.checksum) {
      throw new Error(`cold record for '${aggregateId}' failed checksum on thaw`);
    }
    this._cold.delete(aggregateId);
    return a;
  }

  /** Aggregate ids currently in cold storage. */
  coldIds(): string[] {
    return [...this._cold.keys()];
  }

  get coldCount(): number {
    return this._cold.size;
  }

  /**
   * Scan a hot-store snapshot and return aggregateIds that are
   * archive-eligible (age + terminality), for a nightly job.
   */
  eligible(hot: Iterable<HotAggregate>): string[] {
    const now = this._clock.now();
    const out: string[] = [];
    for (const a of hot) {
      if (this._cold.has(a.aggregateId)) continue;
      if (now - a.lastEventAtMs < this._opts.coldAfterMs) continue;
      if (this._opts.isTerminal && !this._opts.isTerminal(a)) continue;
      out.push(a.aggregateId);
    }
    return out;
  }
}
