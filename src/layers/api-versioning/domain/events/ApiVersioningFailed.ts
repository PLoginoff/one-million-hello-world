/**
 * ApiVersioningFailed Event
 *
 * Raised when api-versioning execution fails.
 */

export interface ApiVersioningFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ApiVersioningFailed {
  readonly payload: ApiVersioningFailedPayload;
  readonly eventName: string;

  constructor(payload: ApiVersioningFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'api-versioning.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ApiVersioningFailed {
    return new ApiVersioningFailed({
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

  toObject(): ApiVersioningFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
