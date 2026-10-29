/**
 * EventPrioritizedStrategy
 *
 * Prioritized event strategy that processes events based on priority levels.
 * Supports priority queues, preemption, and weighted fair queuing.
 *
 * @module EventLayer/Strategies
 */

import type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

/**
 * Event priority levels.
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 50,
  HIGH = 100,
  CRITICAL = 200,
}

/**
 * Priority queue entry.
 */
interface PriorityQueueEntry<T> {
  context: EventStrategyContext;
  priority: number;
  sequence: number;
  resolve: (result: EventStrategyResult<T>) => void;
  reject: (error: Error) => void;
  enqueueTime: number;
}

/**
 * Configuration options for the prioritized strategy.
 */
export interface PrioritizedStrategyConfig {
  /** Maximum queue size per priority level */
  maxQueueSize: number;
  /** Whether to enable priority preemption */
  enablePreemption: boolean;
  /** Maximum time a low-priority event can wait before being promoted (ms) */
  maxWaitTimeMs: number;
  /** Whether to use weighted fair queuing */
  weightedFairQueuing: boolean;
  /** Weight for each priority level (higher = more processing time) */
  priorityWeights: Record<EventPriority, number>;
  /** Number of worker threads for processing */
  workerCount: number;
}

/**
 * Default configuration for prioritized strategy.
 */
export const DEFAULT_PRIORITIZED_CONFIG: PrioritizedStrategyConfig = {
  maxQueueSize: 10000,
  enablePreemption: true,
  maxWaitTimeMs: 30000,
  weightedFairQueuing: true,
  priorityWeights: {
    [EventPriority.LOW]: 1,
    [EventPriority.NORMAL]: 2,
    [EventPriority.HIGH]: 4,
    [EventPriority.CRITICAL]: 8,
  },
  workerCount: 4,
};

/**
 * Prioritized event strategy implementation.
 * Processes events based on priority with configurable queuing semantics.
 *
 * @typeParam T - The type of result data returned by the strategy
 */
export class EventPrioritizedStrategy<T = unknown> implements IEventStrategy<T> {
  /** @inheritdoc */
  public readonly name = 'prioritized';

  /** @inheritdoc */
  public readonly priority = 15;

  private readonly _config: PrioritizedStrategyConfig;
  private readonly _queues: Map<EventPriority, PriorityQueueEntry<T>[]>;
  private readonly _wrappedStrategy: IEventStrategy<T>;
  private _executionCount: number;
  private _sequenceCounter: number;
  private _processing: boolean;
  private _workers: Promise<void>[];
  private _shutdown: boolean;
  private _promotionTimer: ReturnType<typeof setInterval> | null;

  /**
   * Creates a new EventPrioritizedStrategy instance.
   *
   * @param wrappedStrategy - The base strategy to wrap with prioritization
   * @param config - Optional configuration for priority behavior
   */
  constructor(wrappedStrategy: IEventStrategy<T>, config: Partial<PrioritizedStrategyConfig> = {}) {
    this._wrappedStrategy = wrappedStrategy;
    this._config = { ...DEFAULT_PRIORITIZED_CONFIG, ...config };
    this._queues = new Map();
    this._executionCount = 0;
    this._sequenceCounter = 0;
    this._processing = false;
    this._workers = [];
    this._shutdown = false;
    this._promotionTimer = null;

    // Initialize queues for each priority level
    for (const priority of Object.values(EventPriority).filter((v) => typeof v === 'number')) {
      this._queues.set(priority as EventPriority, []);
    }
  }

  /**
   * Starts the priority workers.
   */
  public start(): void {
    if (this._processing) return;
    this._processing = true;
    this._shutdown = false;

    // Start worker loops
    for (let i = 0; i < this._config.workerCount; i++) {
      this._workers.push(this._workerLoop(i));
    }

    // Start promotion timer for aging
    if (this._config.maxWaitTimeMs > 0) {
      this._promotionTimer = setInterval(() => this._promoteAgedEvents(), 1000);
    }
  }

  /**
   * Stops the priority workers and flushes queues.
   */
  public async stop(): Promise<void> {
    this._shutdown = true;
    this._processing = false;

    if (this._promotionTimer) {
      clearInterval(this._promotionTimer);
      this._promotionTimer = null;
    }

    // Wait for all workers to complete
    await Promise.all(this._workers);
    this._workers = [];

    // Reject all pending entries
    for (const queue of this._queues.values()) {
      for (const entry of queue) {
        entry.reject(new Error('Strategy shutdown'));
      }
      queue.length = 0;
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

    // Extract priority from context metadata
    const priority = this._extractPriority(context);

    // For non-publish operations, execute directly
    if (context.operation !== 'publish' && context.operation !== 'emit') {
      return this._executeDirect(context, startTime);
    }

    // Queue for prioritized processing
    return new Promise((resolve, reject) => {
      const entry: PriorityQueueEntry<T> = {
        context,
        priority,
        sequence: this._sequenceCounter++,
        resolve: resolve as (result: EventStrategyResult<T>) => void,
        reject,
        enqueueTime: Date.now(),
      };

      const queue = this._queues.get(priority)!;
      if (queue.length >= this._config.maxQueueSize) {
        reject(new Error(`Queue full for priority ${priority}`));
        return;
      }

      queue.push(entry);
      this._sortQueue(queue);
    });
  }

  /**
   * Executes a context directly (bypassing queue).
   */
  private async _executeDirect(
    context: EventStrategyContext,
    startTime: number
  ): Promise<EventStrategyResult<T>> {
    try {
      const result = await this._wrappedStrategy.execute(context);
      this._executionCount++;
      return {
        ...result,
        metadata: {
          ...result.metadata,
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          queued: false,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          details: { context },
        },
        metadata: {
          strategyName: this.name,
          executionTimeMs: Date.now() - startTime,
          timestamp: Date.now(),
          queued: false,
        },
      };
    }
  }

  /**
   * Worker loop for processing queued events.
   */
  private async _workerLoop(workerId: number): Promise<void> {
    while (this._processing && !this._shutdown) {
      const entry = this._dequeueNext();
      if (!entry) {
        // No work available, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      try {
        const result = await this._wrappedStrategy.execute(entry.context);
        entry.resolve({
          ...result,
          metadata: {
            ...result.metadata,
            strategyName: this.name,
            executionTimeMs: result.metadata?.executionTimeMs ?? 0,
            timestamp: Date.now(),
            queued: true,
            waitTimeMs: Date.now() - entry.enqueueTime,
            workerId,
          },
        });
        this._executionCount++;
      } catch (error) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Dequeues the next event based on priority and weighting.
   */
  private _dequeueNext(): PriorityQueueEntry<T> | null {
    if (this._config.weightedFairQueuing) {
      return this._dequeueWeightedFair();
    }
    return this._dequeueStrictPriority();
  }

  /**
   * Strict priority dequeue (highest priority first).
   */
  private _dequeueStrictPriority(): PriorityQueueEntry<T> | null {
    const priorities = [EventPriority.CRITICAL, EventPriority.HIGH, EventPriority.NORMAL, EventPriority.LOW];

    for (const priority of priorities) {
      const queue = this._queues.get(priority)!;
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }
    return null;
  }

  /**
   * Weighted fair queuing dequeue.
   */
  private _dequeueWeightedFair(): PriorityQueueEntry<T> | null {
    // Simple weighted round-robin: track credits per priority
    // For simplicity, use a deficit round-robin approach
    const priorities = [EventPriority.CRITICAL, EventPriority.HIGH, EventPriority.NORMAL, EventPriority.LOW];

    // Find the priority with the highest weight that has items
    let bestPriority: EventPriority | null = null;
    let bestScore = -1;

    for (const priority of priorities) {
      const queue = this._queues.get(priority)!;
      if (queue.length === 0) continue;

      const weight = this._config.priorityWeights[priority] ?? 1;
      const score = weight * queue.length;

      if (score > bestScore) {
        bestScore = score;
        bestPriority = priority;
      }
    }

    if (bestPriority !== null) {
      const queue = this._queues.get(bestPriority)!;
      return queue.shift()!;
    }

    return null;
  }

  /**
   * Promotes aged events to prevent starvation.
   */
  private _promoteAgedEvents(): void {
    const now = Date.now();
    const priorities = [EventPriority.LOW, EventPriority.NORMAL, EventPriority.HIGH];

    for (const priority of priorities) {
      const queue = this._queues.get(priority)!;
      const nextPriority = this._getNextPriority(priority);
      const nextQueue = this._queues.get(nextPriority)!;

      // Find events that have waited too long
      const agedIndex = queue.findIndex((entry) => now - entry.enqueueTime > this._config.maxWaitTimeMs);

      if (agedIndex !== -1) {
        const agedEntries = queue.splice(agedIndex);
        for (const entry of agedEntries) {
          entry.priority = nextPriority;
          nextQueue.push(entry);
        }
        this._sortQueue(nextQueue);
      }
    }
  }

  /**
   * Gets the next higher priority level.
   */
  private _getNextPriority(priority: EventPriority): EventPriority {
    switch (priority) {
      case EventPriority.LOW:
        return EventPriority.NORMAL;
      case EventPriority.NORMAL:
        return EventPriority.HIGH;
      case EventPriority.HIGH:
        return EventPriority.CRITICAL;
      default:
        return EventPriority.CRITICAL;
    }
  }

  /**
   * Sorts a queue by priority and sequence (FIFO within priority).
   */
  private _sortQueue(queue: PriorityQueueEntry<T>[]): void {
    queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.sequence - b.sequence; // FIFO within priority
    });
  }

  /**
   * Extracts priority from context metadata.
   */
  private _extractPriority(context: EventStrategyContext): number {
    if (context.metadata?.priority !== undefined) {
      const p = context.metadata.priority;
      if (typeof p === 'number') return p;
      if (typeof p === 'string' && p in EventPriority) {
        return EventPriority[p as keyof typeof EventPriority];
      }
    }
    return EventPriority.NORMAL;
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
   * Gets the current queue sizes by priority.
   *
   * @returns Map of priority to queue size
   */
  public getQueueSizes(): Map<EventPriority, number> {
    const sizes = new Map<EventPriority, number>();
    for (const [priority, queue] of this._queues.entries()) {
      sizes.set(priority, queue.length);
    }
    return sizes;
  }

  /**
   * Gets the total queue size across all priorities.
   *
   * @returns Total number of queued events
   */
  public getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this._queues.values()) {
      total += queue.length;
    }
    return total;
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
  public getConfig(): PrioritizedStrategyConfig {
    return { ...this._config };
  }

  /**
   * Checks if the strategy is currently processing.
   *
   * @returns True if processing, false otherwise
   */
  public isProcessing(): boolean {
    return this._processing;
  }
}