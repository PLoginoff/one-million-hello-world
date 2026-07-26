/**
 * EdgeCacheFailed Event
 *
 * Raised when edge-cache execution fails.
 */

export interface EdgeCacheFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EdgeCacheFailed {
  readonly payload: EdgeCacheFailedPayload;
  readonly eventName: string;

  constructor(payload: EdgeCacheFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'edge-cache.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EdgeCacheFailed {
    return new EdgeCacheFailed({
      layerName: 'edge-cache',
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

  toObject(): EdgeCacheFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
