/**
 * ICostOptimizationSpecification interface
 */

export interface ICostOptimizationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ICostOptimizationSpecification): ICostOptimizationSpecification;
  or(other: ICostOptimizationSpecification): ICostOptimizationSpecification;
  not(): ICostOptimizationSpecification;
}
