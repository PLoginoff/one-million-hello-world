/**
 * RepositoryExecuted Event
 *
 * Raised when repository execution completes.
 */

export interface RepositoryExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RepositoryExecuted {
  readonly payload: RepositoryExecutedPayload;
  readonly eventName: string;

  constructor(payload: RepositoryExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'repository.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RepositoryExecuted {
    return new RepositoryExecuted({
      layerName: 'repository',
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

  toObject(): RepositoryExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
