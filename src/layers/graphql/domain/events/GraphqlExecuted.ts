/**
 * GraphqlExecuted Event
 *
 * Raised when graphql execution completes.
 */

export interface GraphqlExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class GraphqlExecuted {
  readonly payload: GraphqlExecutedPayload;
  readonly eventName: string;

  constructor(payload: GraphqlExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'graphql.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): GraphqlExecuted {
    return new GraphqlExecuted({
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

  toObject(): GraphqlExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
