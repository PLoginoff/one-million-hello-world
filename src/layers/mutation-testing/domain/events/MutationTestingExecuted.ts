/**
 * MutationTestingExecuted Event
 *
 * Raised when mutation-testing execution completes.
 */

export interface MutationTestingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class MutationTestingExecuted {
  readonly payload: MutationTestingExecutedPayload;
  readonly eventName: string;

  constructor(payload: MutationTestingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'mutation-testing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): MutationTestingExecuted {
    return new MutationTestingExecuted({
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

  toObject(): MutationTestingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
