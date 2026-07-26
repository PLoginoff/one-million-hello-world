/**
 * QueryObjectExecuted Event
 *
 * Raised when query-object execution completes.
 */

export interface QueryObjectExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class QueryObjectExecuted {
  readonly payload: QueryObjectExecutedPayload;
  readonly eventName: string;

  constructor(payload: QueryObjectExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'query-object.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): QueryObjectExecuted {
    return new QueryObjectExecuted({
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

  toObject(): QueryObjectExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
