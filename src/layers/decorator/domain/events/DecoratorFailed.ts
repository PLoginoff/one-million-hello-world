/**
 * DecoratorFailed Event
 *
 * Raised when decorator execution fails.
 */

export interface DecoratorFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DecoratorFailed {
  readonly payload: DecoratorFailedPayload;
  readonly eventName: string;

  constructor(payload: DecoratorFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'decorator.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DecoratorFailed {
    return new DecoratorFailed({
      layerName: 'decorator',
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

  toObject(): DecoratorFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
