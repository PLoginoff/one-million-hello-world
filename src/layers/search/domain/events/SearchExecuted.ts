/**
 * SearchExecuted Event
 *
 * Raised when search execution completes.
 */

export interface SearchExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SearchExecuted {
  readonly payload: SearchExecutedPayload;
  readonly eventName: string;

  constructor(payload: SearchExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'search.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SearchExecuted {
    return new SearchExecuted({
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

  toObject(): SearchExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
