/**
 * NetworkFailed Event
 *
 * Raised when network execution fails.
 */

export interface NetworkFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class NetworkFailed {
  readonly payload: NetworkFailedPayload;
  readonly eventName: string;

  constructor(payload: NetworkFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'network.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): NetworkFailed {
    return new NetworkFailed({
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

  toObject(): NetworkFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
