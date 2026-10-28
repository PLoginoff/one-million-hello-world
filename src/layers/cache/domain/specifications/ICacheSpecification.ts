/**
 * ICacheSpecification interface
 */

export interface ICacheSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICacheSpecification): ICacheSpecification;
  or(other: ICacheSpecification): ICacheSpecification;
  not(): ICacheSpecification;
}
