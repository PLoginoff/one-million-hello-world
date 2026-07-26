/**
 * ApiVersioningExecuted Event
 *
 * Raised when api-versioning execution completes.
 */

export interface ApiVersioningExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ApiVersioningExecuted {
  readonly payload: ApiVersioningExecutedPayload;
  readonly eventName: string;

  constructor(payload: ApiVersioningExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'api-versioning.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ApiVersioningExecuted {
    return new ApiVersioningExecuted({
      layerName: 'api-versioning',
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

  toObject(): ApiVersioningExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
