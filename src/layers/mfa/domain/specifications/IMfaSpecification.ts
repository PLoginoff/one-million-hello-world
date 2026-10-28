/**
 * IMfaSpecification interface
 */

export interface IMfaSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IMfaSpecification): IMfaSpecification;
  or(other: IMfaSpecification): IMfaSpecification;
  not(): IMfaSpecification;
}
