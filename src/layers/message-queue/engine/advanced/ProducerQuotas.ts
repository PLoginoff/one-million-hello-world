/**
 * ProducerQuotas — per-producer in-flight limits.
 *
 * One noisy producer can flood a shared queue and starve everyone else.
 * Quotas cap how many messages a single producer may have outstanding
 * (enqueued but not yet consumed/acked) — the broker's admission control.
 *
 * Accounting: `checkAndConsume` on enqueue (atomically test-and-increment —
 * a race between check and increment would let bursts overflow); `release`
 * on ack/dead-letter/expiry. The counter tracks "in-flight toward this
 * producer's debt", not queue depth — the same message counts once even if
 * redelivered.
 *
 * Fairness: this is admission control, not scheduling — a producer over
 * quota gets a hard `QuotaExceededError`, not deprioritization, matching
 * how Kafka's `produce` quota throttles at the client.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

import { ProducerQuota, QuotaDecision, QuotaExceededError } from './types';

export interface QuotaConfig {
  /** Default max in-flight per producer (used when no per-producer override). */
  readonly defaultMaxInFlight: number;
  /** Per-producer overrides. */
  readonly overrides?: Readonly<Record<string, number>>;
}

export class ProducerQuotas {
  private readonly quotas = new Map<string, ProducerQuota>();
  private readonly config: QuotaConfig;

  constructor(config: QuotaConfig) {
    this.config = config;
    for (const [pid, max] of Object.entries(config.overrides ?? {})) {
      this.quotas.set(pid, { producerId: pid, maxInFlight: max, inFlight: 0, rejected: 0 });
    }
  }

  /** The quota record for a producer, created lazily at the default limit. */
  quota(producerId: string): ProducerQuota {
    let q = this.quotas.get(producerId);
    if (!q) {
      q = {
        producerId,
        maxInFlight: this.config.defaultMaxInFlight,
        inFlight: 0,
        rejected: 0,
      };
      this.quotas.set(producerId, q);
    }
    return q;
  }

  /**
   * Atomic check-and-consume: if under quota, increments in-flight and
   * allows the send; else rejects and counts it. Single-threaded JS makes
   * the read-modify-write atomic between awaits — the burst race a naive
   * `check(); enqueue();` pair would lose.
   */
  checkAndConsume(producerId: string): QuotaDecision {
    const q = this.quota(producerId);
    if (q.inFlight >= q.maxInFlight) {
      q.rejected++;
      return {
        allowed: false,
        reason: `producer "${producerId}" at quota ${q.inFlight}/${q.maxInFlight}`,
      };
    }
    q.inFlight++;
    return { allowed: true, remaining: q.maxInFlight - q.inFlight };
  }

  /** Same as checkAndConsume but throws `QuotaExceededError` on rejection. */
  assertConsume(producerId: string): void {
    const d = this.checkAndConsume(producerId);
    if (!d.allowed) {
      const q = this.quota(producerId);
      throw new QuotaExceededError(producerId, q.maxInFlight);
    }
  }

  /** Releases one in-flight slot (ack, dead-letter, or expiry). */
  release(producerId: string): void {
    const q = this.quotas.get(producerId);
    if (q && q.inFlight > 0) q.inFlight--;
  }

  /** Releases N slots at once (batch ack). */
  releaseAll(producerId: string, n: number): void {
    for (let i = 0; i < n; i++) this.release(producerId);
  }

  /** Snapshot for metrics. */
  stats(): ReadonlyMap<string, { inFlight: number; maxInFlight: number; rejected: number }> {
    const out = new Map<string, { inFlight: number; maxInFlight: number; rejected: number }>();
    for (const [pid, q] of this.quotas) {
      out.set(pid, { inFlight: q.inFlight, maxInFlight: q.maxInFlight, rejected: q.rejected });
    }
    return out;
  }

  /** Adjusts a producer's limit at runtime (quota policy change). */
  setLimit(producerId: string, maxInFlight: number): void {
    const q = this.quota(producerId);
    (q as { maxInFlight: number }).maxInFlight = maxInFlight;
  }
}
