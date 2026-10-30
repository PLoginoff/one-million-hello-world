/**
 * Authorization Engine2 — public exports.
 *
 * @module AuthorizationLayer/Engine2
 */

export * from './types';
export { ObligationEngine } from './ObligationEngine';
export type { ObligationRule, ObligatedDecision } from './ObligationEngine';
export { HierarchyResolver } from './HierarchyResolver';
export type { HierarchyCheck } from './HierarchyResolver';
export { TemporalAccessControl, minuteOfDay, inWindow } from './TemporalAccess';
export { BulkAuthorizer } from './BulkAuthorizer';
export type { BulkAuthorizerOptions, PrefixDenyOracle } from './BulkAuthorizer';
export { PermissionTrie } from './PermissionTrie';
export { AccessJournal } from './AccessJournal';
export type { AccessEvent, AccessQuery, AccessStats } from './AccessJournal';
export { PolicyComposer, CompositionError } from './PolicyComposition';
export type {
  Verdict,
  PartialVerdict,
  CombiningAlgorithm,
  CompositeDecision,
} from './PolicyComposition';
