/**
 * IRateLimitingSpecification interface
 */

export interface IRateLimitingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRateLimitingSpecification): IRateLimitingSpecification;
  or(other: IRateLimitingSpecification): IRateLimitingSpecification;
  not(): IRateLimitingSpecification;
}
