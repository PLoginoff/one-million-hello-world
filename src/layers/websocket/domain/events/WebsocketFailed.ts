/**
 * WebsocketFailed Event
 *
 * Raised when websocket execution fails.
 */

export interface WebsocketFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class WebsocketFailed {
  readonly payload: WebsocketFailedPayload;
  readonly eventName: string;

  constructor(payload: WebsocketFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'websocket.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): WebsocketFailed {
    return new WebsocketFailed({
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

  toObject(): WebsocketFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
