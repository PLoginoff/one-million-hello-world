/**
 * Event Strategies
 *
 * Exports all event execution strategies.
 *
 * @module EventLayer/Strategies
 */

// Core Strategy Interface
export type { IEventStrategy, EventStrategyContext, EventStrategyResult } from './IEventStrategy';

// Base Strategies
export { EventDefaultStrategy } from './DefaultStrategy';
export { EventFastStrategy } from './FastStrategy';
export { EventReliableStrategy, type ReliableStrategyConfig, DEFAULT_RELIABLE_CONFIG } from './ReliableStrategy';
export { EventCachedStrategy, type CachedStrategyConfig, DEFAULT_CACHED_CONFIG } from './CachedStrategy';
export { EventBatchStrategy, type BatchStrategyConfig, DEFAULT_BATCH_CONFIG } from './BatchStrategy';

// Advanced Strategies
export { EventBroadcastStrategy, type BroadcastStrategyConfig, type BroadcastDeliveryResult, DEFAULT_BROADCAST_CONFIG, type BroadcastMode } from './BroadcastEventStrategy';
export { EventFilteredStrategy, type FilteredStrategyConfig, type FilterRule, type FilterAction, type EventFilterPredicate, DEFAULT_FILTERED_CONFIG, createEventNameFilter, createPayloadFilter, createCorrelationIdFilter } from './FilteredEventStrategy';
export { EventPrioritizedStrategy, type PrioritizedStrategyConfig, DEFAULT_PRIORITIZED_CONFIG, EventPriority } from './PrioritizedEventStrategy';
export { EventDeadLetterStrategy, type DeadLetterStrategyConfig, type DeadLetterEntry, type DeadLetterStatus, type RetryPolicy, DEFAULT_DEAD_LETTER_CONFIG, DEFAULT_RETRY_POLICY } from './DeadLetterEventStrategy';

// Decorator Strategies
export {
  LoggingEventStrategy,
  type IEventLogger,
  type EventLogEntry,
  LogLevel,
  ConsoleEventLogger,
} from './LoggingEventStrategy';

export {
  MetricsEventStrategy,
  type IEventMetricsCollector,
  type EventMetric,
  type EventStrategyMetrics,
  InMemoryEventMetricsCollector,
} from './MetricsEventStrategy';

// Legacy Strategy Exports (for backward compatibility)
export { EventDefaultStrategy as DefaultEventStrategy } from './DefaultStrategy';
export { EventFastStrategy as FastEventStrategy } from './FastStrategy';
export { EventReliableStrategy as ReliableEventStrategy } from './ReliableStrategy';
export { EventCachedStrategy as CachedEventStrategy } from './CachedStrategy';
export { EventBatchStrategy as BatchEventStrategy } from './BatchStrategy';