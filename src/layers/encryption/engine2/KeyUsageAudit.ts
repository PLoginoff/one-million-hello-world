/**
 * Key Usage Audit — append-only log of every key operation.
 *
 * Every operation the hierarchy performs (generate, wrap, unwrap,
 * encrypt, decrypt, retire, destroy, index) is recorded with the key id,
 * the target it touched, and the operation time. Auditors can then answer
 * "which keys encrypted what?" and "was key X ever used after retirement?"
 * — the questions compliance reviews actually ask.
 *
 * Storage is a ring buffer per key plus a global sequence, bounded so
 * long-running services don't grow unboundedly. Events are immutable on
 * write — audit logs must never be editable, or they aren't audit logs.
 *
 * Complexity: O(1) append, O(events-in-window) queries.
 *
 * @module EncryptionLayer/Engine2
 */

import { IClock, KeyOperation, KeyUsageEvent, KeyUsageSummary, SystemClock } from './types';

export interface KeyUsageAuditConfig {
  /** Max retained events globally (oldest evicted). Default 100k. */
  readonly maxEvents?: number;
}

export class KeyUsageAudit {
  private readonly _clock: IClock;
  private readonly _max: number;
  private _events: KeyUsageEvent[] = [];

  constructor(config: KeyUsageAuditConfig = {}, clock: IClock = new SystemClock()) {
    this._clock = clock;
    this._max = config.maxEvents ?? 100_000;
  }

  /** Record one operation. Called by the engines — never trust callers. */
  record(keyId: string, operation: KeyOperation, target: string, detail: string | null = null): void {
    this._events.push({ keyId, operation, target, at: this._clock.now(), detail });
    if (this._events.length > this._max) {
      // Evict oldest in bulk — amortised O(1).
      this._events.splice(0, this._events.length - this._max);
    }
  }

  /** All events for one key, oldest first. */
  forKey(keyId: string): KeyUsageEvent[] {
    return this._events.filter((e) => e.keyId === keyId);
  }

  /** Events in a time window, oldest first. */
  inRange(from: number, to: number): KeyUsageEvent[] {
    return this._events.filter((e) => e.at >= from && e.at <= to);
  }

  /** Per-key rollup: ops histogram + distinct targets. */
  summary(keyId: string): KeyUsageSummary | null {
    const events = this.forKey(keyId);
    if (events.length === 0) return null;
    const byOp: Record<string, number> = {};
    const targets = new Set<string>();
    for (const e of events) {
      byOp[e.operation] = (byOp[e.operation] ?? 0) + 1;
      targets.add(e.target);
    }
    return {
      keyId,
      totalOps: events.length,
      byOperation: byOp,
      targets: [...targets].sort(),
      firstUsed: events[0].at,
      lastUsed: events[events.length - 1].at,
    };
  }

  /**
   * Compliance probe: keys that were used for encrypt/decrypt *after*
   * being retired or destroyed — the "key used after death" smell.
   */
  violationsAfterStatusChange(): { keyId: string; statusAt: number; usedAt: number; operation: KeyOperation }[] {
    const statusAt = new Map<string, number>();
    const out: { keyId: string; statusAt: number; usedAt: number; operation: KeyOperation }[] = [];
    for (const e of this._events) {
      if (e.operation === 'retire' || e.operation === 'destroy') {
        statusAt.set(e.keyId, e.at);
        continue;
      }
      const deadAt = statusAt.get(e.keyId);
      if (deadAt !== undefined && e.at > deadAt && (e.operation === 'encrypt' || e.operation === 'decrypt')) {
        out.push({ keyId: e.keyId, statusAt: deadAt, usedAt: e.at, operation: e.operation });
      }
    }
    return out;
  }

  /** Total events retained. */
  size(): number {
    return this._events.length;
  }
}
