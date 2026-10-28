/**
 * ISagaSpecification interface
 */

export interface ISagaSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISagaSpecification): ISagaSpecification;
  or(other: ISagaSpecification): ISagaSpecification;
  not(): ISagaSpecification;
}
