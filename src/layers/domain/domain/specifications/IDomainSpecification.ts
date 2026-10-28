/**
 * IDomainSpecification interface
 */

export interface IDomainSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDomainSpecification): IDomainSpecification;
  or(other: IDomainSpecification): IDomainSpecification;
  not(): IDomainSpecification;
}
