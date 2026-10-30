/**
 * Multi-Upstream Response Aggregator
 *
 * Fans out to N upstreams in parallel, merges their JSON bodies under
 * per-target merge keys, and degrades gracefully when a target fails or
 * exceeds its timeout — the gateway returns a partial response with a
 * `degraded` flag instead of a 5xx.
 *
 * Timeout handling: each target race is `Promise.race` against a timer
 * injected through `schedule`/`clearScheduled` (defaults to setTimeout)
 * so tests can run fully synchronously.
 *
 * Merge strategies:
 *  - `shallow`      — later keys overwrite (Object.assign semantics)
 *  - `deep`         — recursive object merge; arrays & scalars replace
 *  - `array-concat` — like deep, but arrays concatenate element-wise
 *
 * @module ApiGatewayLayer/Engine2
 */

import {
  AggregationFetcher,
  AggregationOutcome,
  AggregationTarget,
  AggregatedResult,
  JsonObject,
  JsonValue,
  MergeStrategy,
  GatewayClock2,
  SystemGatewayClock2,
  isJsonObject,
} from './types';

export interface ResponseAggregatorOptions {
  readonly clock?: GatewayClock2;
  readonly strategy?: MergeStrategy;
  /** Inject a scheduler for deterministic tests. */
  readonly schedule?: (fn: () => void, ms: number) => unknown;
  readonly clearScheduled?: (handle: unknown) => void;
  /** Default per-target timeout. */
  readonly defaultTimeoutMs?: number;
}

function deepMerge(a: JsonValue, b: JsonValue, concatArrays: boolean): JsonValue {
  if (isJsonObject(a) && isJsonObject(b)) {
    const out: JsonObject = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = k in out ? deepMerge(out[k], v, concatArrays) : v;
    }
    return out;
  }
  if (concatArrays && Array.isArray(a) && Array.isArray(b)) {
    return [...a, ...b];
  }
  return b;
}

/**
 * Merge multiple JSON documents into one object according to `strategy`.
 * Non-object roots are wrapped under `__value` so nothing is silently
 * dropped when upstreams return scalars or arrays.
 */
export function mergeResponses(
  docs: ReadonlyArray<{ key: string; value: JsonValue }>,
  strategy: MergeStrategy
): JsonObject {
  let acc: JsonObject = {};
  for (const { key, value } of docs) {
    const contribution: JsonObject = isJsonObject(value) ? value : { __value: value };
    // Nest under mergeKey unless key is empty (merge at root).
    const wrapped: JsonObject = key.length === 0 ? contribution : { [key]: contribution };
    switch (strategy) {
      case 'shallow':
        acc = { ...acc, ...wrapped };
        break;
      case 'deep':
        acc = deepMerge(acc, wrapped, false) as JsonObject;
        break;
      case 'array-concat':
        acc = deepMerge(acc, wrapped, true) as JsonObject;
        break;
    }
  }
  return acc;
}

export class ResponseAggregator {
  private readonly _clock: GatewayClock2;
  private readonly _strategy: MergeStrategy;
  private readonly _schedule: (fn: () => void, ms: number) => unknown;
  private readonly _clear: (handle: unknown) => void;
  private readonly _defaultTimeoutMs: number;

  constructor(options?: ResponseAggregatorOptions) {
    this._clock = options?.clock ?? new SystemGatewayClock2();
    this._strategy = options?.strategy ?? 'deep';
    this._schedule =
      options?.schedule ??
      ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this._clear =
      options?.clearScheduled ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this._defaultTimeoutMs = options?.defaultTimeoutMs ?? 5_000;
  }

  /**
   * Call every target concurrently via `fetcher` and merge results.
   * Failures never reject the aggregate — they appear as `ok: false`
   * outcomes and flip `degraded` on the result.
   */
  async aggregate(
    targets: readonly AggregationTarget[],
    fetcher: AggregationFetcher
  ): Promise<AggregatedResult> {
    const settled = await Promise.all(
      targets.map((t) => this.callTarget(t, fetcher))
    );

    const docs: Array<{ key: string; value: JsonValue }> = [];
    const outcomes: AggregationOutcome[] = [];
    for (const s of settled) {
      outcomes.push(s.outcome);
      if (s.ok) docs.push({ key: s.target.mergeKey, value: s.value });
    }

    return {
      merged: mergeResponses(docs, this._strategy),
      outcomes,
      degraded: outcomes.some((o) => !o.ok),
    };
  }

  private callTarget(
    target: AggregationTarget,
    fetcher: AggregationFetcher
  ): Promise<{ target: AggregationTarget; ok: boolean; value: JsonValue; outcome: AggregationOutcome }> {
    const started = this._clock.now();
    const timeoutMs = target.timeoutMs ?? this._defaultTimeoutMs;

    return new Promise((resolve) => {
      let finished = false;
      const finish = (ok: boolean, value: JsonValue | undefined, error?: string): void => {
        if (finished) return;
        finished = true;
        this._clear(timer);
        const latencyMs = this._clock.now() - started;
        resolve({
          target,
          ok,
          value: value as JsonValue,
          outcome: { name: target.name, ok, latencyMs, error },
        });
      };

      const timer = this._schedule(() => {
        finish(false, undefined, `timeout after ${timeoutMs}ms`);
      }, timeoutMs);

      Promise.resolve()
        .then(() => fetcher(target))
        .then((value) => finish(true, value))
        .catch((err: unknown) =>
          finish(false, undefined, err instanceof Error ? err.message : String(err))
        );
    });
  }
}
