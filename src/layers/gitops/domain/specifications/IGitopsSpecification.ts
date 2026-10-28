/**
 * IGitopsSpecification interface
 */

export interface IGitopsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IGitopsSpecification): IGitopsSpecification;
  or(other: IGitopsSpecification): IGitopsSpecification;
  not(): IGitopsSpecification;
}
