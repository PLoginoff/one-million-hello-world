/**
 * Identity Engine2 — probabilistic resolution, recovery flows,
 * identity graph, GDPR consent, lifecycle automation.
 *
 * @module Identity/Engine2
 */

export { IdentityResolver, jaro, jaroWinkler, DEFAULT_RESOLVER_CONFIG } from './IdentityResolver';
export type {
  FieldProbabilities,
  ResolverConfig,
  AttributeEvidence,
  DuplicateCandidate,
} from './IdentityResolver';

export { AccountRecoveryFlow, RecoveryState, DEFAULT_RECOVERY_POLICY } from './AccountRecoveryFlow';
export type {
  RecoveryChannel,
  CodeSender,
  RecoveryPolicy,
  ChannelChallenge,
  RecoveryAuditEntry,
  RecoveryFlow,
  ChallengeResult,
} from './AccountRecoveryFlow';

export { IdentityGraph } from './IdentityGraph';
export type {
  IdentityNodeType,
  IdentityEdgeType,
  IdentityNode,
  IdentityEdge,
  GraphHit,
} from './IdentityGraph';

export { ConsentManager, ConsentStatus } from './ConsentManager';
export type { ConsentEvent, ConsentRecordV2, ConsentCheck } from './ConsentManager';

export { LifecycleAutomation, DEFAULT_DORMANCY_POLICY } from './LifecycleAutomation';
export type { DormancyPolicy, LifecycleAction, LifecycleSweepReport, DormancyNotifier } from './LifecycleAutomation';
