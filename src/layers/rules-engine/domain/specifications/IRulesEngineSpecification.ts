/**
 * IRulesEngineSpecification interface
 */

export interface IRulesEngineSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRulesEngineSpecification): IRulesEngineSpecification;
  or(other: IRulesEngineSpecification): IRulesEngineSpecification;
  not(): IRulesEngineSpecification;
}
