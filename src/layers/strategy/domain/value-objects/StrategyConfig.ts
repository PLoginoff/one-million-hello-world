/**
 * Strategy Configuration Value Object
 * 
 * Represents strategy configuration.
 * Immutable value object for strategy management.
 */

export interface StrategyConfigData {
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  timeout: number;
  retryPolicy: RetryPolicy;
  fallbackStrategy?: string;
  tags: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
}

export class StrategyConfig {
  readonly data: StrategyConfigData;

  constructor(data: StrategyConfigData) {
    this._validateConfig(data);
    this.data = { ...data };
  }

  /**
   * Get strategy name
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
   * Check if strategy is enabled
   */
  isEnabled(): boolean {
    return this.data.enabled;
  }

  /**
   * Get priority
   */
  getPriority(): number {
    return this.data.priority;
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
   * Get fallback strategy
   */
  getFallbackStrategy(): string | undefined {
    return this.data.fallbackStrategy;
  }

  /**
   * Get tags
   */
  getTags(): string[] {
    return [...this.data.tags];
  }

  /**
   * Check if has fallback strategy
   */
  hasFallbackStrategy(): boolean {
    return !!this.data.fallbackStrategy;
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
  withUpdates(updates: Partial<StrategyConfigData>): StrategyConfig {
    return new StrategyConfig({ ...this.data, ...updates });
  }

  /**
   * Create default configuration
   */
  static createDefault(name: string): StrategyConfig {
    return new StrategyConfig({
      name,
      description: '',
      enabled: true,
      priority: 0,
      timeout: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000,
        multiplier: 2,
      },
      tags: [],
    });
  }

  /**
   * Create high priority configuration
   */
  static createHighPriority(name: string): StrategyConfig {
    return new StrategyConfig({
      name,
      description: 'High priority strategy',
      enabled: true,
      priority: 100,
      timeout: 10000,
      retryPolicy: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 500,
        maxDelay: 5000,
        multiplier: 2,
      },
      tags: ['high-priority'],
    });
  }

  /**
   * Create low priority configuration
   */
  static createLowPriority(name: string): StrategyConfig {
    return new StrategyConfig({
      name,
      description: 'Low priority strategy',
      enabled: true,
      priority: 0,
      timeout: 60000,
      retryPolicy: {
        maxAttempts: 1,
        backoffStrategy: 'fixed',
        initialDelay: 1000,
        maxDelay: 1000,
        multiplier: 1,
      },
      tags: ['low-priority'],
    });
  }

  private _validateConfig(data: StrategyConfigData): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Strategy name is required');
    }

    if (data.priority < 0) {
      throw new Error('Priority must be non-negative');
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
