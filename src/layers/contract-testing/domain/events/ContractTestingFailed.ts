/**
 * ContractTestingFailed Event
 *
 * Raised when contract-testing execution fails.
 */

export interface ContractTestingFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ContractTestingFailed {
  readonly payload: ContractTestingFailedPayload;
  readonly eventName: string;

  constructor(payload: ContractTestingFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'contract-testing.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ContractTestingFailed {
    return new ContractTestingFailed({
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

  toObject(): ContractTestingFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
