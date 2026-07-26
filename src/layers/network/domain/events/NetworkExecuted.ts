/**
 * NetworkExecuted Event
 *
 * Raised when network execution completes.
 */

export interface NetworkExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class NetworkExecuted {
  readonly payload: NetworkExecutedPayload;
  readonly eventName: string;

  constructor(payload: NetworkExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'network.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): NetworkExecuted {
    return new NetworkExecuted({
      layerName: 'network',
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

  toObject(): NetworkExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
