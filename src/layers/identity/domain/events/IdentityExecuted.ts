/**
 * IdentityExecuted Event
 *
 * Raised when identity execution completes.
 */

export interface IdentityExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class IdentityExecuted {
  readonly payload: IdentityExecutedPayload;
  readonly eventName: string;

  constructor(payload: IdentityExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'identity.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): IdentityExecuted {
    return new IdentityExecuted({
      layerName: 'identity',
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

  toObject(): IdentityExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
