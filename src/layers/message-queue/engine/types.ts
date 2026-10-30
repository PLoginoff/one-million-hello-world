/**
 * Message Queue Engine — shared types.
 *
 * The existing `implementations/MessageQueue` is a plain FIFO array with
 * retry counting — fine for "hello world", but it lacks the machinery a
 * real broker needs. This engine adds the second implementation:
 *
 *   - Binary-heap priority queue (stable FIFO within equal priorities)
 *   - Min-heap delay scheduler (deliverAt-based scheduling)
 *   - At-least-once delivery with ack/redelivery + visibility timeouts
 *   - Dead-letter routing driven by a retry policy
 *   - Consumer-group offset tracking (Kafka-style committed positions)
 *   - Depth metrics + backpressure watermarking
 *
 * All storage is in-memory; timing is injectable for deterministic tests.
 *
 * @module MessageQueueLayer/Engine
 */

/** A message as accepted by `enqueue` (pre-dispatch). */
export interface EngineMessage<T = unknown> {
  readonly id: string;
  readonly payload: T;
  /** Higher priority dispatches first (heap is a max-heap on this key). */
  readonly priority: number;
  /** Monotonic enqueue sequence — stable tie-break inside a priority level. */
  readonly seq: number;
  /** Earliest delivery time (ms epoch, injectable clock). */
  readonly deliverAt: number;
  /** Times this message has been delivered (0 = never). */
  deliveryCount: number;
  /** First enqueue time, for age metrics. */
  readonly enqueuedAt: number;
  /** Last redelivery-visible timestamp (visibility-timeout requeue). */
  visibleAt: number;
  /** Headers (tracing, tenancy, etc.). */
  readonly headers: Record<string, string>;
}

/** Retry / dead-letter policy. */
export interface RetryPolicy {
  /** Max delivery attempts before dead-lettering (>= 1). */
  readonly maxAttempts: number;
  /** Backoff schedule: attemptN delay = baseMs * factor^(n-1), capped. */
  readonly backoffBaseMs: number;
  readonly backoffFactor: number;
  readonly backoffMaxMs: number;
  /**
   * When true, a nacked message is requeued at the head of its priority
   * level (immediate redelivery) instead of waiting for backoff — the
   * "transient failure" fast path.
   */
  readonly immediateRedeliveryOnNack?: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffBaseMs: 100,
  backoffFactor: 2,
  backoffMaxMs: 5_000,
};

/** Consumer-group offset state for one queue. */
export interface GroupOffset {
  readonly group: string;
  /** Next message seq this group will fetch. */
  position: number;
  /** Committed seq — the "safe to not redeliver" watermark. */
  committed: number;
  updatedAt: number;
}

/** Queue-depth snapshot for metrics/backpressure. */
export interface DepthStats {
  readonly queue: string;
  readonly ready: number;
  readonly delayed: number;
  readonly inFlight: number;
  readonly deadLettered: number;
  readonly totalDelivered: number;
  readonly totalDeadLettered: number;
  /** Oldest ready message age (ms), or 0 when empty. */
  readonly oldestAgeMs: number;
}

/** Thrown when enqueue is rejected by a backpressure watermark. */
export class BackpressureError extends Error {
  constructor(
    public readonly queue: string,
    public readonly depth: number,
    public readonly watermark: number
  ) {
    super(`Queue "${queue}" at depth ${depth} >= high watermark ${watermark}`);
    this.name = 'BackpressureError';
  }
}

/** Thrown on illegal queue/group operations. */
export class QueueEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueueEngineError';
  }
}
