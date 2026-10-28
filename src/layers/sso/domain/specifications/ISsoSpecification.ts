/**
 * ISsoSpecification interface
 */

export interface ISsoSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISsoSpecification): ISsoSpecification;
  or(other: ISsoSpecification): ISsoSpecification;
  not(): ISsoSpecification;
}
