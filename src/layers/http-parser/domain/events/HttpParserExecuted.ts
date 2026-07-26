/**
 * HttpParserExecuted Event
 *
 * Raised when http-parser execution completes.
 */

export interface HttpParserExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class HttpParserExecuted {
  readonly payload: HttpParserExecutedPayload;
  readonly eventName: string;

  constructor(payload: HttpParserExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'http-parser.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): HttpParserExecuted {
    return new HttpParserExecuted({
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

  toObject(): HttpParserExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
