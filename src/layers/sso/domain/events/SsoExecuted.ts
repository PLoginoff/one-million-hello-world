/**
 * SsoExecuted Event
 *
 * Raised when sso execution completes.
 */

export interface SsoExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class SsoExecuted {
  readonly payload: SsoExecutedPayload;
  readonly eventName: string;

  constructor(payload: SsoExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'sso.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): SsoExecuted {
    return new SsoExecuted({
      layerName: 'sso',
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

  toObject(): SsoExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
