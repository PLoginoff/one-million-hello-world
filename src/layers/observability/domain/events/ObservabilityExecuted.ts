/**
 * ObservabilityExecuted Event
 *
 * Raised when observability execution completes.
 */

export interface ObservabilityExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ObservabilityExecuted {
  readonly payload: ObservabilityExecutedPayload;
  readonly eventName: string;

  constructor(payload: ObservabilityExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'observability.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ObservabilityExecuted {
    return new ObservabilityExecuted({
      layerName: 'observability',
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

  toObject(): ObservabilityExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
