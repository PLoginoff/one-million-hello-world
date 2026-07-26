/**
 * GraphqlFailed Event
 *
 * Raised when graphql execution fails.
 */

export interface GraphqlFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GraphqlFailed {
  readonly payload: GraphqlFailedPayload;
  readonly eventName: string;

  constructor(payload: GraphqlFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'graphql.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GraphqlFailed {
    return new GraphqlFailed({
      layerName: 'graphql',
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

  toObject(): GraphqlFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
