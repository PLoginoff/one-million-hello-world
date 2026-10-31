/**
 * Request Coalescing — identical concurrent calls share one execution.
 *
 * When N callers request the same key while a fetch is in-flight, only
 * the first actually runs the loader; the others park on the same
 * promise. This is the "request dedup" / "single-flight" pattern that
 * prevents thundering-herd stampedes on cold caches or slow upstreams.
 *
 * Semantics:
 *   - Key is computed by the caller's `keyFn` (e.g. `JSON.stringify(args)`).
 *   - A call joins only while the leader is *still in flight* — once
 *     it settles, a subsequent call triggers a fresh execution. To
 *     dedupe across settle boundaries use {@link ServiceCache} instead.
 *   - Followers get the *same* result object — coalescing shares the
 *     execution, not a copy. Mutation of the result by one follower is
 *     visible to all (documented; callers should treat results as
 *     read-only).
 *   - Loader errors reject *every* parked follower identically.
 *
 * Stats expose `joins` vs `executions` — the ratio is the dedup rate.
 *
 * @module ServiceLayer/Engine
 */

import { Clock, SystemClock } from './TransactionScriptRunner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** In-flight execution record — leader + parked followers. */
interface InFlight<R> {
  /** Shared promise all followers await. */
  readonly promise: Promise<R>;
  /** Followers that joined after the leader. */
  followers: number;
  /** Start timestamp (ms) for leader-latency reporting. */
  readonly startedMs: number;
}

/** Options for {@link RequestCoalescer}. */
export interface CoalescerOptions<A extends readonly unknown[]> {
  /** Compute the dedup key from call args. */
  readonly keyFn: (...args: A) => string;
  /** Clock injection — defaults to Date.now. */
  readonly clock?: Clock;
}

/** Per-execution stats. */
export interface CoalescerStats {
  /** Calls that actually ran the loader. */
  readonly executions: number;
  /** Calls that piggybacked on an in-flight execution. */
  readonly joins: number;
  /** Currently in-flight keys. */
  readonly inFlight: number;
  /** Join ratio (joins / total). */
  readonly dedupRate: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Single-flight coalescer.
 *
 * `execute(key, loader)` — concurrent calls with the same key share
 * the leader's promise; sequential calls re-execute.
 */
export class RequestCoalescer<A extends readonly unknown[] = readonly unknown[], R = unknown> {
  private readonly _keyFn: (...args: A) => string;
  private readonly _clock: Clock;
  private readonly _inFlight: Map<string, InFlight<R>>;
  private _executions: number;
  private _joins: number;

  constructor(options: CoalescerOptions<A>) {
    this._keyFn = options.keyFn;
    this._clock = options.clock ?? new SystemClock();
    this._inFlight = new Map();
    this._executions = 0;
    this._joins = 0;
  }

  /** Currently in-flight keys. */
  get inFlightKeys(): readonly string[] {
    return [...this._inFlight.keys()];
  }

  /**
   * Run `loader(args)` deduplicated by key. Returns the same promise
   * for concurrent identical calls; the loader runs at most once per
   * in-flight window.
   */
  execute(loader: (...args: A) => Promise<R>, ...args: A): Promise<R> {
    const key = this._keyFn(...args);
    const existing = this._inFlight.get(key);
    if (existing !== undefined) {
      existing.followers += 1;
      this._joins += 1;
      return existing.promise;
    }

    this._executions += 1;
    const startedMs = this._clock.now();
    // Run the loader and evict on settle. The record's promise stays
    // untouched so follower rejections are the same rejection object
    // the leader sees (identical, not wrapped). Eviction attaches a
    // handled branch — no unhandled-rejection noise.
    const record: InFlight<R> = {
      followers: 0,
      startedMs,
      promise: loader(...args),
    };
    this._inFlight.set(key, record);
    // Evict on settle — attach the continuation to the record's own
    // promise so it registers BEFORE the caller's `await`, ensuring
    // eviction runs first and a sequential re-execute is never joined.
    void record.promise.then(
      () => {
        this._inFlight.delete(key);
      },
      () => {
        this._inFlight.delete(key);
      }
    );
    return record.promise;
  }

  /** Stats. */
  stats(): CoalescerStats {
    const total = this._executions + this._joins;
    return {
      executions: this._executions,
      joins: this._joins,
      inFlight: this._inFlight.size,
      dedupRate: total === 0 ? 0 : this._joins / total,
    };
  }

  /** Reset counters (keeps in-flight executions untouched). */
  resetStats(): void {
    this._executions = 0;
    this._joins = 0;
  }
}
