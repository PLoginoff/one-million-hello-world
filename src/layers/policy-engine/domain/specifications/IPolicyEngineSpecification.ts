/**
 * IPolicyEngineSpecification interface
 */

export interface IPolicyEngineSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IPolicyEngineSpecification): IPolicyEngineSpecification;
  or(other: IPolicyEngineSpecification): IPolicyEngineSpecification;
  not(): IPolicyEngineSpecification;
}
