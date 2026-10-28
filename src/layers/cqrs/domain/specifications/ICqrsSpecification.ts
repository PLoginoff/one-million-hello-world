/**
 * ICqrsSpecification interface
 */

export interface ICqrsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICqrsSpecification): ICqrsSpecification;
  or(other: ICqrsSpecification): ICqrsSpecification;
  not(): ICqrsSpecification;
}
