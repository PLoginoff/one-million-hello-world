/**
 * IMutationTestingSpecification interface
 */

export interface IMutationTestingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMutationTestingSpecification): IMutationTestingSpecification;
  or(other: IMutationTestingSpecification): IMutationTestingSpecification;
  not(): IMutationTestingSpecification;
}
