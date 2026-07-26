/**
 * CacheExecuted Event
 *
 * Raised when cache execution completes.
 */

export interface CacheExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CacheExecuted {
  readonly payload: CacheExecutedPayload;
  readonly eventName: string;

  constructor(payload: CacheExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cache.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CacheExecuted {
    return new CacheExecuted({
      layerName: 'cache',
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

  toObject(): CacheExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
