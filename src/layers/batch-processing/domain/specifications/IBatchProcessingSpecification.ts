/**
 * IBatchProcessingSpecification interface
 */

export interface IBatchProcessingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBatchProcessingSpecification): IBatchProcessingSpecification;
  or(other: IBatchProcessingSpecification): IBatchProcessingSpecification;
  not(): IBatchProcessingSpecification;
}
