/**
 * EventBroadcastStrategy
 *
 * Broadcast event strategy that publishes events to multiple subscribers
 * with fan-out semantics. Supports parallel and sequential delivery modes.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Broadcast delivery mode.
 */
export type BroadcastMode = 'parallel' | 'sequential' | 'race';

/**
 * Configuration options for the broadcast strategy.
 */
export interface BroadcastStrategyConfig {
  /** Delivery mode for broadcasting */
  mode: BroadcastMode;
  /** Maximum number of concurrent deliveries in parallel mode */
  maxConcurrency: number;
  /** Timeout for each delivery in milliseconds */
  deliveryTimeoutMs: number;
  /** Whether to continue on individual delivery failures */
  continueOnError: boolean;
  /** Whether to collect all results or return on first success (race mode) */
  collectAllResults: boolean;
}

/**
 * Default configuration for broadcast strategy.
 */
export const DEFAULT_BROADCAST_CONFIG: BroadcastStrategyConfig = {
  mode: 'parallel',
  maxConcurrency: 10,
  deliveryTimeoutMs: 5000,
  continueOnError: true,
  collectAllResults: true,
};

/**
 * Result of a single delivery in broadcast.
 */
export interface BroadcastDeliveryResult {
  /** Subscriber identifier */
  subscriberId: string;
  /** Whether the delivery succeeded */
  success: boolean;
  /** Error if delivery failed */
  error?: { code: string; message: string };
  /** Delivery duration in milliseconds */
  durationMs: number;
}

/**
 * Broadcast event strategy implementation.
 * Publishes events to multiple subscribers with configurable delivery semantics.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventBroadcastStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'broadcast';

  /** @inheritdoc */
  public readonly priority = 8;

  private readonly _config: BroadcastStrategyConfig;
  private readonly _subscribers: Map<string, (context: EventStrategyContext) => Promise<EventStrategyResult<T>>>;
  private _executionCount: number;
  private _totalDeliveries: number;
  private _failedDeliveries: number;

  /**
   * Creates a new EventBroadcastStrategy instance.
   *
   * @param config - Optional configuration for broadcast behavior
   */
  constructor(config: Partial<BroadcastStrategyConfig> = {}) {
    this._config = { ...DEFAULT_BROADCAST_CONFIG, ...config };
    this._subscribers = new Map();
    this._executionCount = 0;
    this._totalDeliveries = 0;
    this._failedDeliveries = 0;
  }

  /**
   * Registers a subscriber for broadcast delivery.
   *
   * @param subscriberId - Unique identifier for the subscriber
   * @param handler - Async handler function for the subscriber
   */
  public registerSubscriber(
    subscriberId: string,
    handler: (context: EventStrategyContext) => Promise<EventStrategyResult<T>>
  ): void {
    this._subscribers.set(subscriberId, handler);
  }

  /**
   * Unregisters a subscriber.
   *
   * @param subscriberId - Subscriber identifier to remove
   * @returns True if subscriber was removed, false if not found
   */
  public unregisterSubscriber(subscriberId: string): boolean {
    return this._subscribers.delete(subscriberId);
  }

  /**
   * Gets all registered subscriber IDs.
   *
   * @returns Array of subscriber IDs
   */
  public getSubscribers(): string[] {
    return Array.from(this._subscribers.keys());
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return (
      context !== null &&
      context !== undefined &&
      typeof context.operation === 'string' &&
      context.operation.length > 0 &&
      typeof context.eventName === 'string' &&
      context.eventName.length > 0 &&
      (context.operation === 'publish' || context.operation === 'emit' || context.operation === 'broadcast')
    );
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();

    if (this._subscribers.size === 0) {
      return {
        success: true,
        data: undefined as T,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          subscriberCount: 0,
          deliveries: [],
        },
      };
    }

    const deliveries: BroadcastDeliveryResult[] = [];

    switch (this._config.mode) {
      case 'parallel':
        await this._executeParallel(context, deliveries);
        break;
      case 'sequential':
        await this._executeSequential(context, deliveries);
        break;
      case 'race':
        await this._executeRace(context, deliveries);
        break;
    }

    this._executionCount++;
    this._totalDeliveries += deliveries.length;
    this._failedDeliveries += deliveries.filter((d) => !d.success).length;

    const allSuccessful = deliveries.every((d) => d.success);
    const anySuccessful = deliveries.some((d) => d.success);

    return {
      success: this._config.mode === 'race' ? anySuccessful : allSuccessful,
      data: undefined as T,
      metadata: {
        strategyName: this.name,
        executionTimeMs: Date.now() - startTime,
        timestamp: Date.now(),
        subscriberCount: this._subscribers.size,
        deliveries,
        mode: this._config.mode,
      },
    };
  }

  /**
   * Executes deliveries in parallel with concurrency control.
   */
  private async _executeParallel(
    context: EventStrategyContext,
    deliveries: BroadcastDeliveryResult[]
  ): Promise<void> {
    const subscribers = Array.from(this._subscribers.entries());
    const semaphore = new Semaphore(this._config.maxConcurrency);

    const promises = subscribers.map(async ([subscriberId, handler]) => {
      await semaphore.acquire();
      const deliveryStart = Date.now();
      try {
        const result = await this._executeWithTimeout(handler(context), this._config.deliveryTimeoutMs);
        deliveries.push({
          subscriberId,
          success: result.success,
          error: result.error,
          durationMs: Date.now() - deliveryStart,
        });
      } catch (error) {
        deliveries.push({
          subscriberId,
          success: false,
          error: {
            code: 'DELIVERY_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          durationMs: Date.now() - deliveryStart,
        });
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
  }

  /**
   * Executes deliveries sequentially.
   */
  private async _executeSequential(
    context: EventStrategyContext,
    deliveries: BroadcastDeliveryResult[]
  ): Promise<void> {
    for (const [subscriberId, handler] of this._subscribers.entries()) {
      const deliveryStart = Date.now();
      try {
        const result = await this._executeWithTimeout(handler(context), this._config.deliveryTimeoutMs);
        deliveries.push({
          subscriberId,
          success: result.success,
          error: result.error,
          durationMs: Date.now() - deliveryStart,
        });

        if (!result.success && !this._config.continueOnError) {
          break;
        }
      } catch (error) {
        deliveries.push({
          subscriberId,
          success: false,
          error: {
            code: 'DELIVERY_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          durationMs: Date.now() - deliveryStart,
        });

        if (!this._config.continueOnError) {
          break;
        }
      }
    }
  }

  /**
   * Executes deliveries in race mode (returns on first success).
   */
  private async _executeRace(
    context: EventStrategyContext,
    deliveries: BroadcastDeliveryResult[]
  ): Promise<void> {
    const subscribers = Array.from(this._subscribers.entries());

    const promises = subscribers.map(async ([subscriberId, handler]) => {
      const deliveryStart = Date.now();
      try {
        const result = await this._executeWithTimeout(handler(context), this._config.deliveryTimeoutMs);
        deliveries.push({
          subscriberId,
          success: result.success,
          error: result.error,
          durationMs: Date.now() - deliveryStart,
        });
        return result.success;
      } catch (error) {
        deliveries.push({
          subscriberId,
          success: false,
          error: {
            code: 'DELIVERY_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          durationMs: Date.now() - deliveryStart,
        });
        return false;
      }
    });

    if (this._config.collectAllResults) {
      await Promise.all(promises);
    } else {
      // Race: wait for first success
      for (const promise of promises) {
        const success = await promise;
        if (success) break;
      }
    }
  }

  /**
   * Executes a promise with a timeout.
   */
  private async _executeWithTimeout<U>(promise: Promise<U>, timeoutMs: number): Promise<U> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Delivery timeout')), timeoutMs)
    );
    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Gets the number of times this strategy has been executed.
   *
   * @returns The execution count
   */
  public getExecutionCount(): number {
    return this._executionCount;
  }

  /**
   * Gets the total number of deliveries attempted.
   *
   * @returns The total delivery count
   */
  public getTotalDeliveries(): number {
    return this._totalDeliveries;
  }

  /**
   * Gets the number of failed deliveries.
   *
   * @returns The failed delivery count
   */
  public getFailedDeliveries(): number {
    return this._failedDeliveries;
  }

  /**
   * Gets the delivery success rate (0-1).
   *
   * @returns The delivery success rate
   */
  public getDeliverySuccessRate(): number {
    return this._totalDeliveries > 0 ? 1 - this._failedDeliveries / this._totalDeliveries : 1;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): BroadcastStrategyConfig {
    return { ...this._config };
  }
}

/**
 * Simple semaphore for concurrency control.
 */
class Semaphore {
  private _permits: number;
  private _waiting: Array<() => void> = [];

  constructor(permits: number) {
    this._permits = permits;
  }

  async acquire(): Promise<void> {
    if (this._permits > 0) {
      this._permits--;
      return;
    }
    return new Promise((resolve) => {
      this._waiting.push(resolve);
    });
  }

  release(): void {
    this._permits++;
    if (this._waiting.length > 0) {
      const resolve = this._waiting.shift()!;
      this._permits--;
      resolve();
    }
  }
}