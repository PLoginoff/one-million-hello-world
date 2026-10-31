/**
 * Flow Controller — Adaptive Concurrency & Retry Budgets
 *
 * Gateway-side overload protection that is *not* a static rate
 * limiter (that exists in engine1). Three cooperating mechanisms:
 *
 *  1. **Adaptive concurrency limit** — a TCP-vegas-style AIMD
 *     controller. The limit rises additively while latencies stay
 *     under `rttTarget`; it cuts multiplicatively when the observed
 *     latency gradient says the upstream is queuing (RTT growing
 *     faster than throughput). This is the Netflix-concurrency-limits
 *     "gradient" algorithm in miniature: measure min-RTT as the
 *     no-load floor, then
 *
 *         gradient = minRtt / currentRtt
 *
 *     a gradient < 1 means we're paying queueing delay → shrink the
 *     limit; gradient ≥ 1 → grow it by one.
 *
 *  2. **Semaphore admission** — `acquire()` grants a slot when
 *     in-flight < current limit, else queues (bounded) or sheds with
 *     `shed: true` for load-shedding semantics.
 *
 *  3. **Retry budget** — retries burn a shared token bucket capped
 *     at a fraction of real traffic (default 20% of completed
 *     requests per window): retries are only permitted while
 *     `retryTokens > 0`, and every *successful* first try refills
 *     one token. A collapsing upstream can't be DDoSed by retries.
 *
 * All timing is injectable for deterministic tests.
 *
 * Complexity: acquire/release O(1) amortized + O(queue) on shed.
 *
 * @module ApiGatewayLayer/Engine3
 */

import { GatewayClock3, SystemGatewayClock3 } from './types3';

export interface FlowControllerOptions {
  readonly clock?: GatewayClock3;
  /** Initial concurrency limit (default 20). */
  readonly initialLimit?: number;
  /** Hard ceiling on the adaptive limit (default 200). */
  readonly maxLimit?: number;
  /** Hard floor (default 1). */
  readonly minLimit?: number;
  /** EWMA alpha for the no-load RTT floor (default 0.1). */
  readonly minRttAlpha?: number;
  /**
   * Max queued waiters before shedding (default 100). Queueing is
   * FIFO; a waiter resolves when a slot frees.
   */
  readonly maxQueue?: number;
  /**
   * Retry budget: retries allowed per successful first-try request,
   * as a ratio (default 0.2 → 1 retry per 5 successes).
   */
  readonly retryRatio?: number;
  /** Absolute retry-token cap (default 100). */
  readonly maxRetryTokens?: number;
}

export type AcquireResult =
  | { readonly granted: true; readonly permit: FlowPermit }
  | { readonly granted: false; readonly reason: 'queue-full' | 'over-limit' };

/** A granted concurrency slot — release exactly once. */
export interface FlowPermit {
  /**
   * Return the slot and report the observed latency so the
   * controller can adapt. `ok` marks first-try success (refills a
   * retry token); failures don't.
   */
  release(latencyMs: number, ok: boolean): void;
}

interface Waiter {
  resolve: (p: FlowPermit) => void;
  enqueuedAt: number;
}

export interface FlowStats {
  readonly limit: number;
  readonly inflight: number;
  readonly queued: number;
  readonly granted: number;
  readonly shed: number;
  readonly minRttMs: number;
  readonly lastRttMs: number;
  readonly retryTokens: number;
}

export class FlowController {
  private readonly clock: GatewayClock3;
  private readonly maxLimit: number;
  private readonly minLimit: number;
  private readonly minRttAlpha: number;
  private readonly maxQueue: number;
  private readonly retryRatio: number;
  private readonly maxRetryTokens: number;

  private limit: number;
  private inflight = 0;
  private queue: Waiter[] = [];
  private granted = 0;
  private shed = 0;
  private minRtt = Number.POSITIVE_INFINITY;
  private lastRtt = 0;
  private retryTokens = 0;

  constructor(options: FlowControllerOptions = {}) {
    this.clock = options.clock ?? new SystemGatewayClock3();
    this.limit = options.initialLimit ?? 20;
    this.maxLimit = options.maxLimit ?? 200;
    this.minLimit = options.minLimit ?? 1;
    this.minRttAlpha = options.minRttAlpha ?? 0.1;
    this.maxQueue = options.maxQueue ?? 100;
    this.retryRatio = options.retryRatio ?? 0.2;
    this.maxRetryTokens = options.maxRetryTokens ?? 100;
    if (this.minLimit <= 0 || this.maxLimit < this.minLimit) {
      throw new Error('invalid limit bounds');
    }
    if (this.retryRatio < 0) throw new Error('retryRatio must be >= 0');
    // Seed the retry budget with one burst allowance, honoring the cap.
    this.retryTokens = Math.min(this.maxRetryTokens, this.retryRatio * 10);
  }

  /** Current adaptive limit. */
  get currentLimit(): number {
    return this.limit;
  }

  /**
   * Try to enter without queueing. For load-shedding callers (a
   * health probe, an admin path) this never blocks.
   */
  tryAcquire(): AcquireResult {
    if (this.inflight >= this.limit) {
      this.shed++;
      return { granted: false, reason: 'over-limit' };
    }
    return this.grant();
  }

  /**
   * Acquire a slot, queueing FIFO when full. Resolves immediately on
   * grant; rejects when the queue itself is full (shed).
   */
  async acquire(): Promise<FlowPermit> {
    if (this.inflight < this.limit) {
      const r = this.grant();
      return r.permit;
    }
    if (this.queue.length >= this.maxQueue) {
      this.shed++;
      throw new FlowShedError('queue full — request shed');
    }
    return new Promise<FlowPermit>((resolve) => {
      this.queue.push({ resolve, enqueuedAt: this.clock.now() });
    });
  }

  /**
   * Burn a retry token. Returns false when the budget is empty — the
   * caller should surface the failure instead of retrying.
   */
  consumeRetry(): boolean {
    if (this.retryTokens <= 0) return false;
    this.retryTokens--;
    return true;
  }

  /** Current retry-budget balance. */
  get retryBalance(): number {
    return this.retryTokens;
  }

  stats(): FlowStats {
    return {
      limit: this.limit,
      inflight: this.inflight,
      queued: this.queue.length,
      granted: this.granted,
      shed: this.shed,
      minRttMs: this.minRtt === Number.POSITIVE_INFINITY ? 0 : this.minRtt,
      lastRttMs: this.lastRtt,
      retryTokens: this.retryTokens,
    };
  }

  /* --------------------------- internals ------------------------- */

  private grant(): { granted: true; permit: FlowPermit } {
    this.inflight++;
    this.granted++;
    let released = false;
    const permit: FlowPermit = {
      release: (latencyMs: number, ok: boolean) => {
        if (released) return;
        released = true;
        this.onRelease(latencyMs, ok);
      },
    };
    return { granted: true, permit };
  }

  private onRelease(latencyMs: number, ok: boolean): void {
    this.inflight = Math.max(0, this.inflight - 1);
    this.lastRtt = latencyMs;

    // Track the no-load RTT floor as a slow EWMA of the *minimum*
    // observed latency — new lows snap to it, higher samples decay in.
    if (latencyMs < this.minRtt || this.minRtt === Number.POSITIVE_INFINITY) {
      this.minRtt = latencyMs;
    } else {
      this.minRtt = this.minRttAlpha * latencyMs + (1 - this.minRttAlpha) * this.minRtt;
    }

    // Gradient algorithm: compare current latency against the floor.
    const gradient = this.minRtt / Math.max(latencyMs, 1e-6);
    if (gradient < 1) {
      // Queueing detected — multiplicative decrease.
      this.limit = Math.max(this.minLimit, Math.floor(this.limit * gradient));
    } else {
      // Headroom — additive increase.
      this.limit = Math.min(this.maxLimit, this.limit + 1);
    }

    if (ok) {
      this.retryTokens = Math.min(
        this.maxRetryTokens,
        this.retryTokens + this.retryRatio
      );
    }

    // Wake the longest-queued waiter, if capacity allows.
    const waiter = this.queue.shift();
    if (waiter) {
      const r = this.grant();
      waiter.resolve(r.permit);
    }
  }
}

/** Thrown by `acquire()` when the queue itself overflows. */
export class FlowShedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowShedError';
  }
}
