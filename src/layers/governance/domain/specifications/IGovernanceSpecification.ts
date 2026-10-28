/**
 * IGovernanceSpecification interface
 */

export interface IGovernanceSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IGovernanceSpecification): IGovernanceSpecification;
  or(other: IGovernanceSpecification): IGovernanceSpecification;
  not(): IGovernanceSpecification;
}
