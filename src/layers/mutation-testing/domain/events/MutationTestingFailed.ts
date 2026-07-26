/**
 * MutationTestingFailed Event
 *
 * Raised when mutation-testing execution fails.
 */

export interface MutationTestingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MutationTestingFailed {
  readonly payload: MutationTestingFailedPayload;
  readonly eventName: string;

  constructor(payload: MutationTestingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'mutation-testing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MutationTestingFailed {
    return new MutationTestingFailed({
      layerName: 'mutation-testing',
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

  toObject(): MutationTestingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
