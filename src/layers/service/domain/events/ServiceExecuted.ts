/**
 * ServiceExecuted Event
 *
 * Raised when service execution completes.
 */

export interface ServiceExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ServiceExecuted {
  readonly payload: ServiceExecutedPayload;
  readonly eventName: string;

  constructor(payload: ServiceExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'service.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ServiceExecuted {
    return new ServiceExecuted({
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

  toObject(): ServiceExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
