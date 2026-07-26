/**
 * BotDetectionFailed Event
 *
 * Raised when bot-detection execution fails.
 */

export interface BotDetectionFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BotDetectionFailed {
  readonly payload: BotDetectionFailedPayload;
  readonly eventName: string;

  constructor(payload: BotDetectionFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'bot-detection.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BotDetectionFailed {
    return new BotDetectionFailed({
      layerName: 'bot-detection',
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

  toObject(): BotDetectionFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
