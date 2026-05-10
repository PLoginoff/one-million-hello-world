/**
 * Saga Configuration Value Object
 *
 * Represents saga configuration.
 * Immutable value object for saga management.
 */

export interface SagaConfigData {
  name: string;
  description: string;
  timeout: number;
  retryPolicy: RetryPolicy;
  compensationStrategy: CompensationStrategy;
  isolationLevel: IsolationLevel;
  enableMetrics: boolean;
  enableLogging: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
}

export type BackoffStrategy = 'fixed' | 'exponential' | 'linear';

export type CompensationStrategy = 'automatic' | 'manual' | 'hybrid';

export type IsolationLevel = 'read-committed' | 'repeatable-read' | 'serializable';

export class SagaConfig {
  readonly data: SagaConfigData;

  constructor(data: SagaConfigData) {
    this._validateConfig(data);
    this.data = { ...data };
  }

  /**
   * Get name
   */
  getName(): string {
    return this.data.name;
  }

  /**
   * Get description
   */
  getDescription(): string {
    return this.data.description;
  }

  /**
   * Get timeout
   */
  getTimeout(): number {
    return this.data.timeout;
  }

  /**
   * Get retry policy
   */
  getRetryPolicy(): RetryPolicy {
    return { ...this.data.retryPolicy };
  }

  /**
   * Get compensation strategy
   */
  getCompensationStrategy(): CompensationStrategy {
    return this.data.compensationStrategy;
  }

  /**
   * Get isolation level
   */
  getIsolationLevel(): IsolationLevel {
    return this.data.isolationLevel;
  }

  /**
   * Check if metrics enabled
   */
  isMetricsEnabled(): boolean {
    return this.data.enableMetrics;
  }

  /**
   * Check if logging enabled
   */
  isLoggingEnabled(): boolean {
    return this.data.enableLogging;
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<SagaConfigData>): SagaConfig {
    return new SagaConfig({ ...this.data, ...updates });
  }

  /**
   * Create default configuration
   */
  static createDefault(name: string): SagaConfig {
    return new SagaConfig({
      name,
      description: 'Default saga configuration',
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
      },
      compensationStrategy: 'automatic',
      isolationLevel: 'read-committed',
      enableMetrics: true,
      enableLogging: true,
    });
  }

  /**
   * Create high availability configuration
   */
  static createHighAvailability(name: string): SagaConfig {
    return new SagaConfig({
      name,
      description: 'High availability saga configuration',
      timeout: 60000,
      retryPolicy: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 500,
        maxDelay: 30000,
        multiplier: 1.5,
      },
      compensationStrategy: 'automatic',
      isolationLevel: 'serializable',
      enableMetrics: true,
      enableLogging: true,
    });
  }

  private _validateConfig(data: SagaConfigData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    if (data.timeout < 0) {
      throw new Error('Timeout must be non-negative');
    }

    if (data.retryPolicy.maxAttempts < 1) {
      throw new Error('Max attempts must be at least 1');
    }

    if (data.retryPolicy.initialDelay < 0) {
      throw new Error('Initial delay must be non-negative');
    }

    if (data.retryPolicy.maxDelay < data.retryPolicy.initialDelay) {
      throw new Error('Max delay must be greater than or equal to initial delay');
    }
  }
}
