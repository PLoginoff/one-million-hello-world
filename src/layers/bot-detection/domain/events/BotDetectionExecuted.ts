/**
 * BotDetectionExecuted Event
 *
 * Raised when bot-detection execution completes.
 */

export interface BotDetectionExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class BotDetectionExecuted {
  readonly payload: BotDetectionExecutedPayload;
  readonly eventName: string;

  constructor(payload: BotDetectionExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'bot-detection.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): BotDetectionExecuted {
    return new BotDetectionExecuted({
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

  toObject(): BotDetectionExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
