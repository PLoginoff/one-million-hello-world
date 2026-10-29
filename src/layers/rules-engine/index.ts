/**
 * RulesEngine Layer
 *
 * This module exports all public interfaces, implementations, and types
 * for the RulesEngine Layer (Layer 61 of the architecture).
 */

export { IRulesEngine } from './interfaces/IRulesEngine';
export { RulesEngine } from './implementations/RulesEngine';
export { ProductionRuleEngine } from './implementations/ProductionRuleEngine';
export type {
  Rule,
  RuleAction,
  RuleActionContext,
  RuleEngineOptions,
  Activation,
  ConflictStrategy,
  FireRecord,
  EngineRunResult,
} from './implementations/ProductionRuleEngine';
export * from './types/rules-engine-types';
export * from './domain';
export * from './configuration';
export * from './strategies';
export * from './factories';
