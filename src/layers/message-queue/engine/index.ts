/**
 * Message Queue Engine — public surface.
 *
 * Second broker core for the layer: binary-heap priorities, delayed
 * delivery, at-least-once leasing with visibility timeouts, retry-policy-
 * driven dead lettering, consumer-group offsets, and depth/backpressure
 * metrics.
 *
 * @module MessageQueueLayer/Engine
 */

export { PriorityHeap } from './PriorityHeap';
export { DelayScheduler } from './DelayScheduler';
export { ConsumerGroups } from './ConsumerGroups';
export { BrokerQueue, requireQueue } from './BrokerQueue';
export type { BrokerQueueOptions, DequeueLease } from './BrokerQueue';
export { MessageQueueEngine } from './MessageQueueEngine';
export {
  BackpressureError,
  QueueEngineError,
  DEFAULT_RETRY_POLICY,
} from './types';
export type {
  EngineMessage,
  RetryPolicy,
  GroupOffset,
  DepthStats,
} from './types';
export * from './advanced';
