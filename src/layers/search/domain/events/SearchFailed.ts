/**
 * SearchFailed Event
 *
 * Raised when search execution fails.
 */

export interface SearchFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SearchFailed {
  readonly payload: SearchFailedPayload;
  readonly eventName: string;

  constructor(payload: SearchFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'search.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SearchFailed {
    return new SearchFailed({
      layerName: 'search',
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

  toObject(): SearchFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
