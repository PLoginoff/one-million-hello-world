/**
 * FacadeExecuted Event
 *
 * Raised when facade execution completes.
 */

export interface FacadeExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class FacadeExecuted {
  readonly payload: FacadeExecutedPayload;
  readonly eventName: string;

  constructor(payload: FacadeExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'facade.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): FacadeExecuted {
    return new FacadeExecuted({
      layerName: 'facade',
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

  toObject(): FacadeExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
