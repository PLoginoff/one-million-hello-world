/**
 * AggregationEngine — fan-out to N subsystems, merge with timeouts.
 *
 * The "API composition" primitive: one request needs data from
 * profile + preferences + recommendations subsystems. Sequential
 * calls sum latencies; this engine fires them in parallel and merges:
 *
 *   request ─┬─> subsystem A ─┐
 *            ├─> subsystem B ─┼─> merge(results) ──> response
 *            └─> subsystem C ─┘
 *
 * Semantics:
 *   - Each subsystem gets its own timeout (`Subsystem.timeoutMs` or
 *     `defaultTimeoutMs`). A timed-out optional subsystem contributes
 *     `null` to the merge rather than failing the aggregate; a timed-out
 *     *required* subsystem fails the whole call with
 *     `RequiredSubsystemError`.
 *   - Subsystem errors follow the same rule: optional → recorded in
 *     `errors` map + `null` result; required → throws.
 *   - Timeouts race the subsystem promise — the underlying call keeps
 *     running (JS can't cancel promises) but its late result is
 *     discarded. `abandoned` counts these.
 *   - `timeoutFn` is injectable so tests use a manual timer wheel
 *     rather than real `setTimeout`.
 *
 * Merge: caller supplies `merge(results)` receiving a `Map<name, T|null>`
 * plus the `errors` map — the engine doesn't guess a shape.
 *
 * Complexity: O(N) parallel calls; wall-clock = max(subsystem latencies).
 *
 * @module FacadeLayer/Engine
 */

import {
  FacadeEngineClock,
  RequiredSubsystemError,
  Subsystem,
  SubsystemTimeoutError,
  SystemEngineClock,
} from './types';

/** Injectable timeout — resolves nothing, rejects after `ms`. */
export type TimeoutFn = (ms: number, label: string) => Promise<never>;

const realTimeout: TimeoutFn = (ms, label) =>
  new Promise((_, reject) => {
    setTimeout(() => reject(new SubsystemTimeoutError(label, ms)), ms);
  });

export interface AggregationOptions {
  /** Timeout for subsystems without their own (ms). Default 10s. */
  defaultTimeoutMs?: number;
  /** Max subsystems running concurrently; `0` = all at once. Default 0. */
  maxConcurrency?: number;
  timeoutFn?: TimeoutFn;
  clock?: FacadeEngineClock;
}

export interface AggregationResult<R> {
  value: R;
  /** Per-subsystem outcome. */
  results: Map<string, unknown | null>;
  /** Errors by subsystem name (timeouts + failures, optional only). */
  errors: Map<string, unknown>;
  /** Subsystems that timed out — their promises may still be running. */
  abandoned: string[];
  /** Wall-clock duration on the engine clock. */
  durationMs: number;
}

export class AggregationEngine {
  private readonly _clock: FacadeEngineClock;
  private readonly _defaultTimeoutMs: number;
  private readonly _maxConcurrency: number;
  private readonly _timeoutFn: TimeoutFn;

  constructor(options: AggregationOptions = {}) {
    this._clock = options.clock ?? new SystemEngineClock();
    this._defaultTimeoutMs = Math.max(1, options.defaultTimeoutMs ?? 10_000);
    this._maxConcurrency = Math.max(0, options.maxConcurrency ?? 0);
    this._timeoutFn = options.timeoutFn ?? realTimeout;
  }

  /**
   * Fan out to `subsystems`, merge with `merge`.
   * Throws `RequiredSubsystemError` when a required subsystem fails.
   */
  async aggregate<R>(
    subsystems: readonly Subsystem[],
    merge: (results: ReadonlyMap<string, unknown | null>, errors: ReadonlyMap<string, unknown>) => R,
  ): Promise<AggregationResult<R>> {
    const started = this._clock.now();
    const results = new Map<string, unknown | null>();
    const errors = new Map<string, unknown>();
    const abandoned: string[] = [];

    const runOne = async (s: Subsystem): Promise<void> => {
      const timeout = s.timeoutMs ?? this._defaultTimeoutMs;
      let timedOut = false;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => s.call()),
          this._timeoutFn(timeout, s.name).catch((e: unknown) => {
            timedOut = e instanceof SubsystemTimeoutError;
            throw e;
          }),
        ]);
        results.set(s.name, value);
      } catch (err: unknown) {
        if (timedOut) abandoned.push(s.name);
        if (s.required) {
          throw new RequiredSubsystemError(s.name, err);
        }
        errors.set(s.name, err);
        results.set(s.name, null);
      }
    };

    if (this._maxConcurrency <= 0) {
      // All at once — but a required failure must reject the aggregate
      // promptly, so race against a shared "required failure" promise.
      await this._fanOutAll(subsystems, runOne);
    } else {
      await this._fanOutBounded(subsystems, runOne);
    }

    return {
      value: merge(results, errors),
      results,
      errors,
      abandoned,
      durationMs: this._clock.now() - started,
    };
  }

  /**
   * Fan out and short-circuit on the first required failure: the
   * aggregate throws as soon as a required subsystem fails rather than
   * waiting for the rest.
   */
  private async _fanOutAll(subsystems: readonly Subsystem[], runOne: (s: Subsystem) => Promise<void>): Promise<void> {
    let requiredError: RequiredSubsystemError | null = null;
    const all = subsystems.map((s) =>
      runOne(s).catch((e: unknown) => {
        if (e instanceof RequiredSubsystemError && requiredError === null) requiredError = e;
        // Optional subsystems never reject; captured inside runOne.
      }),
    );
    await Promise.all(all);
    if (requiredError) throw requiredError;
  }

  /**
   * Bounded-concurrency fan-out: a fixed worker pool pulls subsystems
   * from the queue. A required failure drains the queue fast — remaining
   * work is skipped.
   */
  private async _fanOutBounded(subsystems: readonly Subsystem[], runOne: (s: Subsystem) => Promise<void>): Promise<void> {
    const queue = subsystems.slice();
    let cursor = 0;
    let requiredError: RequiredSubsystemError | null = null;
    const workers = Math.min(this._maxConcurrency, queue.length);

    const worker = async (): Promise<void> => {
      while (requiredError === null) {
        const i = cursor++;
        if (i >= queue.length) return;
        try {
          await runOne(queue[i]);
        } catch (e: unknown) {
          if (e instanceof RequiredSubsystemError) {
            requiredError = e;
            return;
          }
        }
      }
    };

    const ps: Promise<void>[] = [];
    for (let i = 0; i < workers; i++) ps.push(worker());
    await Promise.all(ps);
    if (requiredError) throw requiredError;
  }
}
