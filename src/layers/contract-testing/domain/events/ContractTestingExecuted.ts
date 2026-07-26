/**
 * ContractTestingExecuted Event
 *
 * Raised when contract-testing execution completes.
 */

export interface ContractTestingExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ContractTestingExecuted {
  readonly payload: ContractTestingExecutedPayload;
  readonly eventName: string;

  constructor(payload: ContractTestingExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'contract-testing.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ContractTestingExecuted {
    return new ContractTestingExecuted({
      layerName: 'contract-testing',
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

  toObject(): ContractTestingExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
