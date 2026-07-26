/**
 * DecoratorExecuted Event
 *
 * Raised when decorator execution completes.
 */

export interface DecoratorExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class DecoratorExecuted {
  readonly payload: DecoratorExecutedPayload;
  readonly eventName: string;

  constructor(payload: DecoratorExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'decorator.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): DecoratorExecuted {
    return new DecoratorExecuted({
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

  toObject(): DecoratorExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
