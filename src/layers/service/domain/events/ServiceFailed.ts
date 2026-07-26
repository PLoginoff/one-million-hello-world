/**
 * ServiceFailed Event
 *
 * Raised when service execution fails.
 */

export interface ServiceFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceFailed {
  readonly payload: ServiceFailedPayload;
  readonly eventName: string;

  constructor(payload: ServiceFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceFailed {
    return new ServiceFailed({
      layerName: 'service',
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

  toObject(): ServiceFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
