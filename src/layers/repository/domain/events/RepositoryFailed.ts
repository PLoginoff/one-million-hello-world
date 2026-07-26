/**
 * RepositoryFailed Event
 *
 * Raised when repository execution fails.
 */

export interface RepositoryFailedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class RepositoryFailed {
  readonly payload: RepositoryFailedPayload;
  readonly eventName: string;

  constructor(payload: RepositoryFailedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'repository.failed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): RepositoryFailed {
    return new RepositoryFailed({
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

  toObject(): RepositoryFailedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
