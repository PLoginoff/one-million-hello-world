/**
 * TransportFailed Event
 *
 * Raised when transport execution fails.
 */

export interface TransportFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class TransportFailed {
  readonly payload: TransportFailedPayload;
  readonly eventName: string;

  constructor(payload: TransportFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'transport.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): TransportFailed {
    return new TransportFailed({
      layerName: 'transport',
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

  toObject(): TransportFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
