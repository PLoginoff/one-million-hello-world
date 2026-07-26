/**
 * CacheFailed Event
 *
 * Raised when cache execution fails.
 */

export interface CacheFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class CacheFailed {
  readonly payload: CacheFailedPayload;
  readonly eventName: string;

  constructor(payload: CacheFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'cache.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): CacheFailed {
    return new CacheFailed({
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

  toObject(): CacheFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
