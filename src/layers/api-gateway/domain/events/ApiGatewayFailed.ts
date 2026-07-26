/**
 * ApiGatewayFailed Event
 *
 * Raised when api-gateway execution fails.
 */

export interface ApiGatewayFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ApiGatewayFailed {
  readonly payload: ApiGatewayFailedPayload;
  readonly eventName: string;

  constructor(payload: ApiGatewayFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'api-gateway.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ApiGatewayFailed {
    return new ApiGatewayFailed({
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

  toObject(): ApiGatewayFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
