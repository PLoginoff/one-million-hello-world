/**
 * EventDeadLetterStrategy
 *
 * Dead letter event strategy that captures failed events for later inspection
 * and replay. Provides retry policies, dead letter queue, and replay mechanisms.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Dead letter entry status.
 */
export type DeadLetterStatus = 'pending' | 'retrying' | 'failed' | 'replayed' | 'discarded';

/**
 * Dead letter queue entry.
 */
export interface DeadLetterEntry<T = unknown> {
  /** Unique identifier for the dead letter entry */
  id: string;
  /** Original execution context */
  context: EventStrategyContext;
  /** Error that caused the failure */
  error: { code: string; message: string; details?: Record<string, unknown> };
  /** Number of retry attempts made */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Current status of the entry */
  status: DeadLetterStatus;
  /** Timestamp when the entry was created */
  createdAt: number;
  /** Timestamp of last retry attempt */
  lastRetryAt?: number;
  /** Timestamp when the entry was resolved */
  resolvedAt?: number;
  /** Result of successful replay (if applicable) */
  replayResult?: EventStrategyResult<T>;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
  /** Jitter factor (0-1) to add randomness to delays */
  jitterFactor: number;
  /** List of error codes that should trigger retry */
  retryableErrorCodes: string[];
  /** List of error codes that should NOT trigger retry */
  nonRetryableErrorCodes: string[];
}

/**
 * Default retry policy.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  exponentialBackoff: true,
  jitterFactor: 0.1,
  retryableErrorCodes: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_FAILURE', 'RATE_LIMITED'],
  nonRetryableErrorCodes: ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'],
};

/**
 * Configuration options for the dead letter strategy.
 */
export interface DeadLetterStrategyConfig {
  /** Retry policy for failed events */
  retryPolicy: RetryPolicy;
  /** Maximum size of the dead letter queue */
  maxQueueSize: number;
  /** Whether to automatically retry failed events */
  autoRetry: boolean;
  /** Interval for automatic retry processing (ms) */
  autoRetryIntervalMs: number;
  /** Whether to persist dead letter entries */
  persistEntries: boolean;
  /** Maximum age of entries before automatic discard (ms) */
  maxEntryAgeMs: number;
  /** Callback for when an entry is moved to dead letter queue */
  onDeadLetter?: (entry: DeadLetterEntry) => void;
  /** Callback for when an entry is successfully replayed */
  onReplaySuccess?: (entry: DeadLetterEntry, result: EventStrategyResult<unknown>) => void;
  /** Callback for when an entry is discarded */
  onDiscard?: (entry: DeadLetterEntry) => void;
}

/**
 * Default configuration for dead letter strategy.
 */
export const DEFAULT_DEAD_LETTER_CONFIG: DeadLetterStrategyConfig = {
  retryPolicy: DEFAULT_RETRY_POLICY,
  maxQueueSize: 10000,
  autoRetry: true,
  autoRetryIntervalMs: 30000,
  persistEntries: false,
  maxEntryAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Dead letter event strategy implementation.
 * Captures failed events for inspection, retry, and replay.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventDeadLetterStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'dead-letter';

  /** @inheritdoc */
  public readonly priority = 1;

  private readonly _config: DeadLetterStrategyConfig;
  private readonly _wrappedStrategy: IEventStrategy<T>;
  private readonly _deadLetterQueue: Map<string, DeadLetterEntry<T>>;
  private _executionCount: number;
  private _deadLetterCount: number;
  private _replayCount: number;
  private _discardCount: number;
  private _autoRetryTimer: ReturnType<typeof setInterval> | null;
  private _cleanupTimer: ReturnType<typeof setInterval> | null;

  /**
   * Creates a new EventDeadLetterStrategy instance.
   *
   * @param wrappedStrategy - The base strategy to wrap with dead letter handling
   * @param config - Optional configuration for dead letter behavior
   */
  constructor(wrappedStrategy: IEventStrategy<T>, config: Partial<DeadLetterStrategyConfig> = {}) {
    this._wrappedStrategy = wrappedStrategy;
    this._config = { ...DEFAULT_DEAD_LETTER_CONFIG, ...config };
    this._deadLetterQueue = new Map();
    this._executionCount = 0;
    this._deadLetterCount = 0;
    this._replayCount = 0;
    this._discardCount = 0;
    this._autoRetryTimer = null;
    this._cleanupTimer = null;
  }

  /**
   * Starts automatic retry and cleanup processing.
   */
  public start(): void {
    if (this._config.autoRetry && this._config.autoRetryIntervalMs > 0) {
      this._autoRetryTimer = setInterval(() => this._processRetries(), this._config.autoRetryIntervalMs);
    }

    if (this._config.maxEntryAgeMs > 0) {
      this._cleanupTimer = setInterval(() => this._cleanupOldEntries(), 60000); // Check every minute
    }
  }

  /**
   * Stops automatic processing.
   */
  public stop(): void {
    if (this._autoRetryTimer) {
      clearInterval(this._autoRetryTimer);
      this._autoRetryTimer = null;
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /**
   * @inheritdoc
   */
  public canHandle(context: EventStrategyContext): boolean {
    return this._wrappedStrategy.canHandle(context);
  }

  /**
   * @inheritdoc
   */
  public async execute(context: EventStrategyContext): Promise<EventStrategyResult<T>> {
    const startTime = Date.now();

    try {
      const result = await this._wrappedStrategy.execute(context);

      if (!result.success) {
        // Check if error is retryable
        const errorCode = result.error?.code ?? 'UNKNOWN_ERROR';
        if (this._isRetryable(errorCode)) {
          await this._addToDeadLetter(context, result.error!, 0);
        }
      }

      this._executionCount++;
      return {
        ...result,
        metadata: {
          ...result.metadata,
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      const errorInfo = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        details: { context },
      };

      if (this._isRetryable(errorInfo.code)) {
        await this._addToDeadLetter(context, errorInfo, 0);
      }

      return {
        success: false,
        error: errorInfo,
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
        },
      };
    }
  }

  /**
   * Adds a failed event to the dead letter queue.
   */
  private async _addToDeadLetter(
    context: EventStrategyContext,
    error: { code: string; message: string; details?: Record<string, unknown> },
    retryCount: number
  ): Promise<string> {
    // Check queue size limit
    if (this._deadLetterQueue.size >= this._config.maxQueueSize) {
      // Remove oldest entry
      const oldestKey = this._deadLetterQueue.keys().next().value;
      if (oldestKey) {
        const oldest = this._deadLetterQueue.get(oldestKey)!;
        this._discardEntry(oldest, 'queue_full');
      }
    }

    const id = `dlq_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const entry: DeadLetterEntry<T> = {
      id,
      context,
      error,
      retryCount,
      maxRetries: this._config.retryPolicy.maxRetries,
      status: 'pending',
      createdAt: Date.now(),
      metadata: {
        strategyName: this._wrappedStrategy.name,
        originalPriority: context.metadata?.priority,
      },
    };

    this._deadLetterQueue.set(id, entry);
    this._deadLetterCount++;

    if (this._config.onDeadLetter) {
      try {
        this._config.onDeadLetter(entry);
      } catch {
        // Ignore callback errors
      }
    }

    return id;
  }

  /**
   * Processes pending retries.
   */
  private async _processRetries(): Promise<void> {
    const entries = Array.from(this._deadLetterQueue.values()).filter(
      (e) => e.status === 'pending' || e.status === 'retrying'
    );

    for (const entry of entries) {
      if (entry.retryCount >= entry.maxRetries) {
        entry.status = 'failed';
        continue;
      }

      const delay = this._calculateRetryDelay(entry.retryCount);
      const timeSinceLastRetry = entry.lastRetryAt ? Date.now() - entry.lastRetryAt : Infinity;

      if (timeSinceLastRetry < delay) {
        continue; // Not time to retry yet
      }

      entry.status = 'retrying';
      entry.lastRetryAt = Date.now();
      entry.retryCount++;

      try {
        const result = await this._wrappedStrategy.execute(entry.context);

        if (result.success) {
          entry.status = 'replayed';
          entry.resolvedAt = Date.now();
          entry.replayResult = result;
          this._replayCount++;

          if (this._config.onReplaySuccess) {
            try {
              this._config.onReplaySuccess(entry, result);
            } catch {
              // Ignore callback errors
            }
          }

          // Remove from queue after successful replay
          this._deadLetterQueue.delete(entry.id);
        } else {
          entry.status = 'pending';
          // Will be retried again if retryable
        }
      } catch (error) {
        entry.status = 'pending';
        entry.error = {
          code: 'RETRY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: { originalError: entry.error },
        };
      }
    }
  }

  /**
   * Calculates retry delay with exponential backoff and jitter.
   */
  private _calculateRetryDelay(retryCount: number): number {
    const { baseDelayMs, maxDelayMs, exponentialBackoff, jitterFactor } = this._config.retryPolicy;

    let delay: number;
    if (exponentialBackoff) {
      delay = baseDelayMs * Math.pow(2, retryCount);
    } else {
      delay = baseDelayMs;
    }

    delay = Math.min(delay, maxDelayMs);

    // Add jitter
    const jitter = delay * jitterFactor * Math.random();
    delay += jitter;

    return Math.floor(delay);
  }

  /**
   * Checks if an error code is retryable.
   */
  private _isRetryable(errorCode: string): boolean {
    const { retryableErrorCodes, nonRetryableErrorCodes } = this._config.retryPolicy;

    if (nonRetryableErrorCodes.includes(errorCode)) {
      return false;
    }

    if (retryableErrorCodes.length > 0 && !retryableErrorCodes.includes(errorCode)) {
      return false;
    }

    return true;
  }

  /**
   * Cleans up old entries based on max age.
   */
  private _cleanupOldEntries(): void {
    const now = Date.now();
    const maxAge = this._config.maxEntryAgeMs;

    for (const [id, entry] of this._deadLetterQueue.entries()) {
      if (now - entry.createdAt > maxAge) {
        this._discardEntry(entry, 'max_age_exceeded');
      }
    }
  }

  /**
   * Discards an entry from the queue.
   */
  private _discardEntry(entry: DeadLetterEntry<T>, reason: string): void {
    entry.status = 'discarded';
    entry.resolvedAt = Date.now();
    entry.metadata = { ...entry.metadata, discardReason: reason };
    this._deadLetterQueue.delete(entry.id);
    this._discardCount++;

    if (this._config.onDiscard) {
      try {
        this._config.onDiscard(entry);
      } catch {
        // Ignore callback errors
      }
    }
  }

  /**
   * Manually replays a dead letter entry.
   *
   * @param entryId - The dead letter entry ID
   * @returns The replay result
   */
  public async replay(entryId: string): Promise<EventStrategyResult<T>> {
    const entry = this._deadLetterQueue.get(entryId);
    if (!entry) {
      throw new Error(`Dead letter entry not found: ${entryId}`);
    }

    entry.status = 'retrying';
    entry.lastRetryAt = Date.now();
    entry.retryCount = 0; // Reset for manual replay

    try {
      const result = await this._wrappedStrategy.execute(entry.context);

      if (result.success) {
        entry.status = 'replayed';
        entry.resolvedAt = Date.now();
        entry.replayResult = result;
        this._replayCount++;

        if (this._config.onReplaySuccess) {
          try {
            this._config.onReplaySuccess(entry, result);
          } catch {
            // Ignore callback errors
          }
        }

        this._deadLetterQueue.delete(entryId);
      } else {
        entry.status = 'pending';
      }

      return result;
    } catch (error) {
      entry.status = 'pending';
      throw error;
    }
  }

  /**
   * Replays all pending dead letter entries.
   *
   * @returns Array of replay results
   */
  public async replayAll(): Promise<Array<{ entryId: string; result: EventStrategyResult<T> }>> {
    const entries = Array.from(this._deadLetterQueue.values()).filter(
      (e) => e.status === 'pending' || e.status === 'failed'
    );

    const results: Array<{ entryId: string; result: EventStrategyResult<T> }> = [];

    for (const entry of entries) {
      try {
        const result = await this.replay(entry.id);
        results.push({ entryId: entry.id, result });
      } catch (error) {
        results.push({
          entryId: entry.id,
          result: {
            success: false,
            error: {
              code: 'REPLAY_ERROR',
              message: error instanceof Error ? error.message : 'Unknown error',
            },
            metadata: {
              strategyName: this.name,
              executionTimeMs: 0,
              timestamp: Date.now(),
            },
          },
        });
      }
    }

    return results;
  }

  /**
   * Discards a dead letter entry.
   *
   * @param entryId - The dead letter entry ID
   * @returns True if entry was discarded, false if not found
   */
  public discard(entryId: string): boolean {
    const entry = this._deadLetterQueue.get(entryId);
    if (!entry) return false;

    this._discardEntry(entry, 'manual_discard');
    return true;
  }

  /**
   * Gets a dead letter entry by ID.
   *
   * @param entryId - The dead letter entry ID
   * @returns The entry or undefined if not found
   */
  public getEntry(entryId: string): DeadLetterEntry<T> | undefined {
    return this._deadLetterQueue.get(entryId);
  }

  /**
   * Gets all dead letter entries.
   *
   * @returns Array of all entries
   */
  public getAllEntries(): DeadLetterEntry<T>[] {
    return Array.from(this._deadLetterQueue.values());
  }

  /**
   * Gets entries filtered by status.
   *
   * @param status - The status to filter by
   * @returns Array of matching entries
   */
  public getEntriesByStatus(status: DeadLetterStatus): DeadLetterEntry<T>[] {
    return Array.from(this._deadLetterQueue.values()).filter((e) => e.status === status);
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
   * Gets the total number of dead letter entries created.
   *
   * @returns The dead letter count
   */
  public getDeadLetterCount(): number {
    return this._deadLetterCount;
  }

  /**
   * Gets the number of successful replays.
   *
   * @returns The replay count
   */
  public getReplayCount(): number {
    return this._replayCount;
  }

  /**
   * Gets the number of discarded entries.
   *
   * @returns The discard count
   */
  public getDiscardCount(): number {
    return this._discardCount;
  }

  /**
   * Gets the current queue size.
   *
   * @returns The number of entries in the dead letter queue
   */
  public getQueueSize(): number {
    return this._deadLetterQueue.size;
  }

  /**
   * Gets the wrapped strategy.
   *
   * @returns The wrapped strategy
   */
  public getWrappedStrategy(): IEventStrategy<T> {
    return this._wrappedStrategy;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The configuration
   */
  public getConfig(): DeadLetterStrategyConfig {
    return { ...this._config };
  }
}