/**
 * Facade Configuration Value Object
 *
 * Represents facade configuration.
 * Immutable value object for facade management.
 */

export interface FacadeConfigData {
  name: string;
  description: string;
  enabled: boolean;
  timeout: number;
  retryPolicy: RetryPolicy;
  fallbackEnabled: boolean;
  tags: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
}

export class FacadeConfig {
  readonly data: FacadeConfigData;

  constructor(data: FacadeConfigData) {
    this._validateConfig(data);
    this.data = { ...data };
  }

  /**
   * Get facade name
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
   * Check if facade is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
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
   * Check if fallback is enabled
   */
  isFallbackEnabled(): boolean {
    return this.data.fallbackEnabled;
  }

  /**
   * Get tags
   */
  getTags(): string[] {
    return [...this.data.tags];
  }

  /**
   * Check if tag is present
   */
  hasTag(tag: string): boolean {
    return this.data.tags.includes(tag);
  }

  /**
   * Create a copy with updated values
   */
  withUpdates(updates: Partial<FacadeConfigData>): FacadeConfig {
    return new FacadeConfig({ ...this.data, ...updates });
  }

  /**
   * Create default configuration
   */
  static createDefault(name: string): FacadeConfig {
    return new FacadeConfig({
      name,
      description: '',
      enabled: true,
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
      },
      fallbackEnabled: true,
      tags: [],
    });
  }

  /**
   * Create high availability configuration
   */
  static createHighAvailability(name: string): FacadeConfig {
    return new FacadeConfig({
      name,
      description: 'High availability facade',
      enabled: true,
      timeout: 10000,
      retryPolicy: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 500,
        maxDelay: 5000,
        multiplier: 2,
      },
      fallbackEnabled: true,
      tags: ['high-availability'],
    });
  }

  private _validateConfig(data: FacadeConfigData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Facade name is required');
    }

    if (data.timeout <= 0) {
      throw new Error('Timeout must be positive');
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

    if (data.retryPolicy.multiplier < 1) {
      throw new Error('Multiplier must be at least 1');
    }
  }
}
