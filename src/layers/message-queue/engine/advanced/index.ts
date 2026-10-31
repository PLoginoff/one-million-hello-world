/**
 * Advanced Queue Engine — public surface.
 *
 * Operational features layered over the broker engine: multi-queue two-
 * phase-commit transactions, timing-wheel message TTL with dead-lettering,
 * per-producer admission quotas, correlation/causation message tracing,
 * and priority preemption under an in-flight budget.
 *
 * @module MessageQueueLayer/Engine/Advanced
 */

export { QueueTransaction, TransactionCoordinator } from './QueueTransaction';
export type { TxQueue } from './QueueTransaction';
export { MessageExpiry } from './MessageExpiry';
export type { ExpiryOptions } from './MessageExpiry';
export { ProducerQuotas } from './ProducerQuotas';
export type { QuotaConfig } from './ProducerQuotas';
export { MessageTracer } from './MessageTracer';
export type { TracerOptions } from './MessageTracer';
export { QueueFairness } from './QueueFairness';
export type { FairnessClass } from './QueueFairness';
export { FifoSequencer } from './FifoSequencer';
export type { SequencedMessage, SequencerOptions } from './FifoSequencer';
export { PreemptingQueue } from './PreemptingQueue';
export type { PreemptingQueueOptions } from './PreemptingQueue';
export { AdvancedQueueEngine } from './AdvancedQueueEngine';
export type { AdvancedQueueOptions, TracedLease } from './AdvancedQueueEngine';
export {
  TransactionStateError,
  QuotaExceededError,
  PrepareFailedError,
} from './types';
export type {
  StagedSend,
  TxState,
  ProducerQuota,
  TraceContext,
  TraceSpan,
  TracedMessage,
  QuotaDecision,
} from './types';
