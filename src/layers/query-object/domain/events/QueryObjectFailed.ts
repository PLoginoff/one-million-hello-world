/**
 * QueryObjectFailed Event
 *
 * Raised when query-object execution fails.
 */

export interface QueryObjectFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class QueryObjectFailed {
  readonly payload: QueryObjectFailedPayload;
  readonly eventName: string;

  constructor(payload: QueryObjectFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'query-object.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): QueryObjectFailed {
    return new QueryObjectFailed({
      layerName: 'query-object',
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

  toObject(): QueryObjectFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
