/**
 * IBotDetectionSpecification interface
 */

export interface IBotDetectionSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IBotDetectionSpecification): IBotDetectionSpecification;
  or(other: IBotDetectionSpecification): IBotDetectionSpecification;
  not(): IBotDetectionSpecification;
}
