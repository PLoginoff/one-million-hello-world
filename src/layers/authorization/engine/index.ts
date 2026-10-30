/**
 * Authorization Engine — public exports.
 *
 * @module AuthorizationLayer/Engine
 */

export * from './types';
export {
  RbacResolver,
  permissionMatches,
  coveredBy,
  diffPermissions,
} from './RbacResolver';
export type { EffectiveDiff } from './RbacResolver';
export { AbacEvaluator, evaluateCondition, policyApplies } from './AbacEvaluator';
export type { PolicyMatch } from './AbacEvaluator';
export {
  DecisionCache,
  decisionKey,
  environmentFingerprint,
} from './DecisionCache';
export type { DecisionCacheConfig } from './DecisionCache';
export { DelegationRegistry } from './DelegationRegistry';
export type { DelegationRequest } from './DelegationRegistry';
export { AuthzEngine } from './AuthzEngine';
export type { AuthzEngineConfig } from './AuthzEngine';
