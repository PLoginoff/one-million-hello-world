/**
 * ApiGatewayExecuted Event
 *
 * Raised when api-gateway execution completes.
 */

export interface ApiGatewayExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ApiGatewayExecuted {
  readonly payload: ApiGatewayExecutedPayload;
  readonly eventName: string;

  constructor(payload: ApiGatewayExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'api-gateway.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ApiGatewayExecuted {
    return new ApiGatewayExecuted({
      layerName: 'api-gateway',
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

  toObject(): ApiGatewayExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
