/**
 * CircuitBreakerExecuted Event
 *
 * Raised when circuit-breaker execution completes.
 */

export interface CircuitBreakerExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CircuitBreakerExecuted {
  readonly payload: CircuitBreakerExecutedPayload;
  readonly eventName: string;

  constructor(payload: CircuitBreakerExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'circuit-breaker.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CircuitBreakerExecuted {
    return new CircuitBreakerExecuted({
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

  toObject(): CircuitBreakerExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
