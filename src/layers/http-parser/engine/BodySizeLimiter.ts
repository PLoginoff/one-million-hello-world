/**
 * BodySizeLimiter — mid-stream byte budget for request bodies.
 *
 * A body-size cap enforced *at the edge of parse* is only as good as
 * where it's enforced: a limiter that buffers the whole body and then
 * checks the length is a DoS amplifier, not a defense. This limiter
 * is a pass-through gate — `feed` forwards bytes up to the budget
 * and throws `BodyLimitExceededError` on the exact chunk that crosses
 * it, carrying `received` so callers can log how far it got.
 *
 * Two modes:
 *  - hard (default): crossing the limit throws; nothing is forwarded
 *    for the offending chunk beyond the budget boundary (the
 *    over-limit prefix is still accepted so callers reconstruct the
 *    truncated body if they need it for forensics).
 *  - soft: `feed` returns `exceeded: true` and forwards only the
 *    in-budget prefix without throwing — for callers that want to
 *    keep parsing the head of an oversized body (e.g. sniffing the
 *    content-type of an upload before rejecting it).
 *
 * Complexity: O(1) bookkeeping per feed plus the O(n) slice when
 * truncating.
 *
 * @module HttpParserLayer/Engine
 */

import {
  BodyLimitExceededError,
  BodyLimitOptions,
  BodyLimitResult,
} from './types';

export class BodySizeLimiter {
  private readonly _maxBytes: number;
  private readonly _hard: boolean;
  private _total: number;
  private _exceeded: boolean;

  /**
   * @param options.maxBytes hard cap on total forwarded bytes
   * @param hard             throw on exceed (true) or truncate+flag (false)
   */
  constructor(options: BodyLimitOptions, hard = true) {
    if (options.maxBytes <= 0) {
      throw new RangeError('maxBytes must be > 0');
    }
    this._maxBytes = options.maxBytes;
    this._hard = hard;
    this._total = 0;
    this._exceeded = false;
  }

  get totalAccepted(): number {
    return this._total;
  }

  get exceeded(): boolean {
    return this._exceeded;
  }

  get remaining(): number {
    return Math.max(0, this._maxBytes - this._total);
  }

  /**
   * Offer a chunk. Under-budget chunks pass through untouched; the
   * chunk that crosses the budget is truncated to `remaining` and
   * (in hard mode) throws — the caller aborts the body parse there.
   */
  feed(chunk: Uint8Array): BodyLimitResult {
    if (this._exceeded) {
      // Post-limit feeds in soft mode forward nothing.
      return { accepted: new Uint8Array(0), totalAccepted: this._total, exceeded: true };
    }

    const room = this._maxBytes - this._total;
    if (chunk.byteLength <= room) {
      this._total += chunk.byteLength;
      return { accepted: chunk, totalAccepted: this._total, exceeded: false };
    }

    // Budget crossing: forward the in-budget prefix, then flag.
    const accepted = chunk.subarray(0, room);
    this._total += accepted.byteLength;
    this._exceeded = true;

    if (this._hard) {
      throw new BodyLimitExceededError(this._maxBytes, this._total + (chunk.byteLength - room));
    }
    return { accepted, totalAccepted: this._total, exceeded: true };
  }

  /** Reset the counter — one limiter instance per request normally. */
  reset(): void {
    this._total = 0;
    this._exceeded = false;
  }
}
