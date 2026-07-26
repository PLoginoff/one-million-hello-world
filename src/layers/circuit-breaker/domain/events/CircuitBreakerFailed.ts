/**
 * CircuitBreakerFailed Event
 *
 * Raised when circuit-breaker execution fails.
 */

export interface CircuitBreakerFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CircuitBreakerFailed {
  readonly payload: CircuitBreakerFailedPayload;
  readonly eventName: string;

  constructor(payload: CircuitBreakerFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'circuit-breaker.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CircuitBreakerFailed {
    return new CircuitBreakerFailed({
      layerName: 'circuit-breaker',
      executionId: executionId,
      timestamp: Date.now(),
      durationMs: durationMs,
      success: success,
      metadata: metadata,
    });
  }

  getAge(): number {
    return Date.now() - this.payload.timestamp;
  }

  toObject(): CircuitBreakerFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
