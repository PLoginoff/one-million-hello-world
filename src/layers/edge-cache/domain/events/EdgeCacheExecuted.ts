/**
 * EdgeCacheExecuted Event
 *
 * Raised when edge-cache execution completes.
 */

export interface EdgeCacheExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class EdgeCacheExecuted {
  readonly payload: EdgeCacheExecutedPayload;
  readonly eventName: string;

  constructor(payload: EdgeCacheExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'edge-cache.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): EdgeCacheExecuted {
    return new EdgeCacheExecuted({
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

  toObject(): EdgeCacheExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
