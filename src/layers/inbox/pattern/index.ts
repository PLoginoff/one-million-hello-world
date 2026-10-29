/**
 * Inbox Pattern — real idempotent-consumer engine.
 */

export {
  InboxState,
  ProcessOutcome,
  InboxPatternErrorCode,
  InboxPatternError,
  DEFAULT_RETRY,
  DEFAULT_INBOX_CONFIG,
} from './types';
export type {
  InboxRecord,
  ReceiveResult,
  MessageHandler,
  InboxRetryConfig,
  InboxEngineConfig,
  ConsumerStats,
} from './types';

export { InboxStateMachine } from './InboxStateMachine';
export { BackoffStrategy } from './BackoffStrategy';
export { InboxEngine } from './InboxEngine';
export { SequenceBuffer } from './SequenceBuffer';
export { DeadLetterInspector, errorSignature, ageBucket } from './DeadLetterInspector';
export type { ParkCluster } from './DeadLetterInspector';
export { ThroughputTracker } from './ThroughputTracker';
export type { ThroughputRates } from './ThroughputTracker';
