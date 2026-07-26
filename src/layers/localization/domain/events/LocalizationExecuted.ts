/**
 * LocalizationExecuted Event
 *
 * Raised when localization execution completes.
 */

export interface LocalizationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class LocalizationExecuted {
  readonly payload: LocalizationExecutedPayload;
  readonly eventName: string;

  constructor(payload: LocalizationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'localization.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): LocalizationExecuted {
    return new LocalizationExecuted({
      layerName: 'localization',
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

  toObject(): LocalizationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
