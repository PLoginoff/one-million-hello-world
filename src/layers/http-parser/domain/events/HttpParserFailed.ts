/**
 * HttpParserFailed Event
 *
 * Raised when http-parser execution fails.
 */

export interface HttpParserFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class HttpParserFailed {
  readonly payload: HttpParserFailedPayload;
  readonly eventName: string;

  constructor(payload: HttpParserFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'http-parser.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): HttpParserFailed {
    return new HttpParserFailed({
      layerName: 'http-parser',
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

  toObject(): HttpParserFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
