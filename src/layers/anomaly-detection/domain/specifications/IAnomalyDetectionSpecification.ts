/**
 * IAnomalyDetectionSpecification interface
 */

export interface IAnomalyDetectionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification;
  or(other: IAnomalyDetectionSpecification): IAnomalyDetectionSpecification;
  not(): IAnomalyDetectionSpecification;
}
