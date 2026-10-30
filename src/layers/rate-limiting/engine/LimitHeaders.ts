/**
 * LimitHeaders — compute the standard rate-limit response headers.
 *
 * Emits the de-facto standard set:
 *   X-RateLimit-Limit      — configured limit (requests/window)
 *   X-RateLimit-Remaining  — requests left in the current window
 *   X-RateLimit-Reset      — unix SECONDS when the window clears
 *                            (not ms — the spec and every client
 *                            expects epoch-seconds; emitting ms is a
 *                            classic off-by-1000 bug)
 *   Retry-After            — seconds until retry is safe; emitted
 *                            only on denied responses
 *
 * Plus `draft` variants (`RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset` — the IETF draft header names) via
 * `draftHeaders()` for forward compatibility.
 *
 * All values are computed, not formatted — the caller maps them onto
 * its response object.
 *
 * @module RateLimitingLayer/Engine
 */

import { LimitHeaderInput, RateLimitHeaders } from './types';

export class LimitHeaders {
  /**
   * Compute the X-RateLimit-* header set. `resetAtMs` is a unix-ms
   * timestamp; the header value is seconds (rounded up — a reset of
   * "1.2s from now" must say the next second, not truncate down).
   */
  static compute(input: LimitHeaderInput): RateLimitHeaders {
    const headers: { -readonly [k in keyof RateLimitHeaders]: string } = {
      'X-RateLimit-Limit': String(input.limit),
      'X-RateLimit-Remaining': String(Math.max(0, input.remaining)),
      'X-RateLimit-Reset': String(Math.ceil(input.resetAtMs / 1000)),
    };
    if (input.retryAfterMs !== undefined && input.retryAfterMs > 0) {
      headers['Retry-After'] = String(Math.ceil(input.retryAfterMs / 1000));
    }
    return headers;
  }

  /**
   * IETF draft header names (`RateLimit-*`). Same semantics, different
   * names — emit alongside X-RateLimit-* during the transition period
   * the draft anticipates.
   */
  static draftHeaders(input: LimitHeaderInput): Record<string, string> {
    const out: Record<string, string> = {
      'RateLimit-Limit': String(input.limit),
      'RateLimit-Remaining': String(Math.max(0, input.remaining)),
      'RateLimit-Reset': String(Math.ceil(input.resetAtMs / 1000)),
    };
    if (input.retryAfterMs !== undefined && input.retryAfterMs > 0) {
      out['Retry-After'] = String(Math.ceil(input.retryAfterMs / 1000));
    }
    return out;
  }

  /** Merge both header sets — the forward-compatible emission. */
  static all(input: LimitHeaderInput): Record<string, string> {
    return { ...LimitHeaders.compute(input), ...LimitHeaders.draftHeaders(input) };
  }
}
