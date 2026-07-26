/**
 * LocalizationFailed Event
 *
 * Raised when localization execution fails.
 */

export interface LocalizationFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class LocalizationFailed {
  readonly payload: LocalizationFailedPayload;
  readonly eventName: string;

  constructor(payload: LocalizationFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'localization.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): LocalizationFailed {
    return new LocalizationFailed({
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

  toObject(): LocalizationFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
