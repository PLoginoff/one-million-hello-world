/**
 * PolicyEngine Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the PolicyEngine Layer (Layer 62 of the architecture).
 */

export { IPolicyEngine } from './interfaces/IPolicyEngine';
export { PolicyEngine } from './implementations/PolicyEngine';
export { PolicyDecisionPoint, PolicyRepository, DecisionCache, contextHash } from './implementations/PolicyDecisionPoint';
export type {
  StoredPolicy,
  PolicyVersionEntry,
  AuditRecord,
  AuditListener,
  PolicyDecisionPointOptions,
  EvaluateOptions,
} from './implementations/PolicyDecisionPoint';
export * from './types/policy-engine-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
