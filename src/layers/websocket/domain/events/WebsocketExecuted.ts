/**
 * WebsocketExecuted Event
 *
 * Raised when websocket execution completes.
 */

export interface WebsocketExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WebsocketExecuted {
  readonly payload: WebsocketExecutedPayload;
  readonly eventName: string;

  constructor(payload: WebsocketExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'websocket.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WebsocketExecuted {
    return new WebsocketExecuted({
      layerName: 'websocket',
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

  toObject(): WebsocketExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
