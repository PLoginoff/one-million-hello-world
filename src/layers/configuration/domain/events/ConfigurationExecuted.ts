/**
 * ConfigurationExecuted Event
 *
 * Raised when configuration execution completes.
 */

export interface ConfigurationExecutedPayload {
  layerName: string;
  executionId: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  metadata: Record<string, unknown>;
}

export class ConfigurationExecuted {
  readonly payload: ConfigurationExecutedPayload;
  readonly eventName: string;

  constructor(payload: ConfigurationExecutedPayload) {
    this.payload = { ...payload, metadata: { ...payload.metadata } };
    this.eventName = 'configuration.executed';
  }

  static create(
    executionId: string,
    durationMs: number,
    success: boolean,
    metadata: Record<string, unknown> = {}
  ): ConfigurationExecuted {
    return new ConfigurationExecuted({
      layerName: 'configuration',
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

  toObject(): ConfigurationExecutedPayload {
    return { ...this.payload, metadata: { ...this.payload.metadata } };
  }
}
