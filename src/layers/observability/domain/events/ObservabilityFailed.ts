/**
 * ObservabilityFailed Event
 *
 * Raised when observability execution fails.
 */

export interface ObservabilityFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ObservabilityFailed {
  readonly payload: ObservabilityFailedPayload;
  readonly eventName: string;

  constructor(payload: ObservabilityFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'observability.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ObservabilityFailed {
    return new ObservabilityFailed({
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

  toObject(): ObservabilityFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
