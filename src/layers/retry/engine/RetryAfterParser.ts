/**
 * RetryAfterParser — parses HTTP `Retry-After` header values.
 *
 * RFC 9110 §10.2.3 defines two forms:
 *   Retry-After: 120                          (delay-seconds)
 *   Retry-After: Fri, 31 Dec 1999 23:59:59 GMT (HTTP-date)
 *
 * Real-world servers also emit non-standard shapes seen in the wild:
 *   Retry-After: 120000      (delta-milliseconds — Azure APIs)
 *   Retry-After: 0.5         (fractional seconds — some CDNs)
 *
 * Parsing rules (applied in order):
 *   1. blank / unparseable → `null` (caller falls back to its own backoff)
 *   2. pure integer        → seconds, UNLESS `preferMs` is set OR the
 *                            value exceeds `secondsThreshold` (values
 *                            above ~86400 are almost certainly ms — a
 *                            >1-day retry-after in seconds is itself a
 *                            bug or an ms value in disguise)
 *   3. decimal             → seconds (fractional)
 *   4. HTTP-date           → date − now
 *   5. result is clamped to [0, `maxMs`]
 *
 * The parser is pure — no state, no clock required except for the
 * HTTP-date branch, which receives `nowMs` explicitly so tests are
 * deterministic.
 *
 * Complexity: O(1) — a handful of regexes.
 *
 * @module RetryLayer/Engine
 */

import { RetryEngineClock, SystemEngineClock } from './types';

export interface RetryAfterParseOptions {
  /** Now in ms (for HTTP-date). Defaults to the injected clock. */
  nowMs?: number;
  /** Treat bare integers as milliseconds (Azure convention). Default false. */
  preferMs?: boolean;
  /**
   * Bare integers ≥ this are treated as ms even without `preferMs`.
   * Default 86400 (a full day in seconds — longer retry-afters in
   * seconds are near-certainly ms).
   */
  secondsThreshold?: number;
  /** Upper bound on returned delay (ms). Default 1h. */
  maxMs?: number;
}

export class RetryAfterParser {
  private readonly _clock: RetryEngineClock;
  private readonly _preferMs: boolean;
  private readonly _secondsThreshold: number;
  private readonly _maxMs: number;

  constructor(clock: RetryEngineClock = new SystemEngineClock(), defaults: Omit<RetryAfterParseOptions, 'nowMs'> = {}) {
    this._clock = clock;
    this._preferMs = defaults.preferMs ?? false;
    this._secondsThreshold = defaults.secondsThreshold ?? 86_400;
    this._maxMs = defaults.maxMs ?? 3_600_000;
  }

  /**
   * Parse a `Retry-After` value into milliseconds.
   * Returns `null` when the value is absent or unparseable.
   */
  parse(header: string | undefined | null, options: RetryAfterParseOptions = {}): number | null {
    if (header === undefined || header === null) return null;
    const raw = header.trim();
    if (raw.length === 0) return null;

    const preferMs = options.preferMs ?? this._preferMs;
    const secThreshold = options.secondsThreshold ?? this._secondsThreshold;
    const maxMs = options.maxMs ?? this._maxMs;
    const nowMs = options.nowMs ?? this._clock.now();

    // Form: integer or decimal number.
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return null;
      const isInteger = Number.isInteger(n);
      let ms: number;
      if (preferMs || (isInteger && n >= secThreshold)) {
        ms = n;
      } else {
        ms = n * 1000;
      }
      return this._clamp(ms, maxMs);
    }

    // Form: HTTP-date (IMF-fixdate or RFC 850 / asctime variants —
    // Date.parse handles all three reliably enough for this use).
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return this._clamp(parsed - nowMs, maxMs);
    }

    return null;
  }

  /**
   * Convenience for header maps: find `retry-after` case-insensitively
   * and parse it.
   */
  parseFromHeaders(headers: Record<string, string | string[] | undefined>, options: RetryAfterParseOptions = {}): number | null {
    for (const [name, value] of Object.entries(headers)) {
      if (name.toLowerCase() !== 'retry-after') continue;
      const raw = Array.isArray(value) ? value[0] : value;
      return this.parse(raw, options);
    }
    return null;
  }

  private _clamp(ms: number, maxMs: number): number {
    if (!Number.isFinite(ms)) return maxMs;
    return Math.max(0, Math.min(maxMs, Math.round(ms)));
  }
}
