/**
 * Canary Deploy — Traffic Mirror (shadow testing)
 *
 * Duplicates a fraction of production requests to the canary without exposing
 * users to canary responses — "shadow" or "dark" traffic. The primary response
 * is always returned to the caller; the mirrored copy is executed against the
 * canary handler asynchronously and its result compared for divergence.
 *
 * The mirror is deliberately a *stub* of a real network tee: callers supply
 * the `canaryHandler` (how a mirrored request is executed) and a `differ`
 * (which response fields to compare). The mirror itself handles sampling
 * (deterministic via injected random), bounded result retention, and
 * divergence-rate tracking — the parts a real mirror delegates to us.
 *
 * @module CanaryDeploy/Canary
 */

import { CanaryClock, MirroredRequest, MirrorResult } from './CanaryTypes';

/** Handler that executes a mirrored request against the canary. */
export type CanaryHandler = (
  req: MirroredRequest
) => Promise<{ latencyMs: number; response: Record<string, unknown> } | { latencyMs: number; error: string }>;

/** Picks the response fields to compare (defaults to shallow equality of all keys). */
export type ResponseDiffer = (
  primary: Readonly<Record<string, unknown>>,
  canary: Readonly<Record<string, unknown>>
) => ReadonlyArray<string>;

export class TrafficMirror {
  private readonly _clock: CanaryClock;
  private readonly _random: () => number;
  private readonly _canaryHandler: CanaryHandler;
  private readonly _differ: ResponseDiffer;
  private _mirrorFraction: number;
  private readonly _results: MirrorResult[] = [];
  private readonly _maxResults: number;
  private _mirrored = 0;
  private _diverged = 0;
  private _errored = 0;

  constructor(
    canaryHandler: CanaryHandler,
    options: {
      clock?: CanaryClock;
      random?: () => number;
      differ?: ResponseDiffer;
      mirrorFraction?: number;
      maxResults?: number;
    } = {}
  ) {
    this._clock = options.clock ?? Date.now;
    this._random = options.random ?? Math.random;
    this._canaryHandler = canaryHandler;
    this._differ = options.differ ?? TrafficMirror.shallowDiffer;
    this._mirrorFraction = options.mirrorFraction ?? 1;
    this._maxResults = options.maxResults ?? 10_000;
    if (!(this._mirrorFraction >= 0 && this._mirrorFraction <= 1)) {
      throw new RangeError('mirrorFraction must be in [0,1]');
    }
  }

  get mirrorFraction(): number {
    return this._mirrorFraction;
  }

  setMirrorFraction(f: number): void {
    if (!(f >= 0 && f <= 1)) throw new RangeError('mirrorFraction must be in [0,1]');
    this._mirrorFraction = f;
  }

  get results(): ReadonlyArray<MirrorResult> {
    return this._results;
  }

  /** Fraction of mirrored requests whose canary response diverged or errored. */
  get divergenceRate(): number {
    return this._mirrored === 0 ? 0 : (this._diverged + this._errored) / this._mirrored;
  }

  get mirroredCount(): number {
    return this._mirrored;
  }

  /**
   * Default differ: keys whose shallow (===) values differ between responses.
   */
  static shallowDiffer(
    primary: Readonly<Record<string, unknown>>,
    canary: Readonly<Record<string, unknown>>
  ): string[] {
    const keys = new Set([...Object.keys(primary), ...Object.keys(canary)]);
    const diff: string[] = [];
    for (const k of keys) {
      if (primary[k] !== canary[k]) diff.push(k);
    }
    return diff;
  }

  /**
   * Maybe mirror a request. When the sampling draw falls inside
   * `mirrorFraction`, the request is cloned and executed against the canary;
   * the returned result is null when not sampled. Mirroring NEVER throws —
   * a canary-side failure is captured in the result, not propagated, because
   * shadow traffic must never affect production.
   */
  async mirror(
    requestId: string,
    payload: Readonly<Record<string, unknown>>,
    primaryResponse: Readonly<Record<string, unknown>>
  ): Promise<MirrorResult | null> {
    if (this._random() >= this._mirrorFraction) {
      return null;
    }
    this._mirrored++;
    const req: MirroredRequest = { requestId, payload, mirroredAt: this._clock() };

    let result: MirrorResult;
    try {
      const r = await this._canaryHandler(req);
      if ('error' in r) {
        this._errored++;
        result = {
          requestId,
          canaryLatencyMs: r.latencyMs,
          canaryOk: false,
          diffKeys: [],
          error: r.error,
        };
      } else {
        const diff = this._differ(primaryResponse, r.response);
        if (diff.length > 0) this._diverged++;
        result = {
          requestId,
          canaryLatencyMs: r.latencyMs,
          canaryOk: true,
          diffKeys: diff,
        };
      }
    } catch (e) {
      this._errored++;
      result = {
        requestId,
        canaryLatencyMs: 0,
        canaryOk: false,
        diffKeys: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }

    this._results.push(result);
    if (this._results.length > this._maxResults) {
      this._results.splice(0, this._results.length - this._maxResults);
    }
    return result;
  }

  reset(): void {
    this._results.length = 0;
    this._mirrored = 0;
    this._diverged = 0;
    this._errored = 0;
  }
}
