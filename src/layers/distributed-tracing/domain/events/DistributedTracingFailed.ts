/**
 * DistributedTracingFailed Event
 *
 * Raised when distributed-tracing execution fails.
 */

export interface DistributedTracingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DistributedTracingFailed {
  readonly payload: DistributedTracingFailedPayload;
  readonly eventName: string;

  constructor(payload: DistributedTracingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'distributed-tracing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DistributedTracingFailed {
    return new DistributedTracingFailed({
      layerName: 'distributed-tracing',
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

  toObject(): DistributedTracingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
