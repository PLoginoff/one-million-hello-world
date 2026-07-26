/**
 * TransportExecuted Event
 *
 * Raised when transport execution completes.
 */

export interface TransportExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class TransportExecuted {
  readonly payload: TransportExecutedPayload;
  readonly eventName: string;

  constructor(payload: TransportExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'transport.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): TransportExecuted {
    return new TransportExecuted({
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

  toObject(): TransportExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
