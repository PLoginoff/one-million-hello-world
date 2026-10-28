/**
 * IPerformanceTestingSpecification interface
 */

export interface IPerformanceTestingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification;
  or(other: IPerformanceTestingSpecification): IPerformanceTestingSpecification;
  not(): IPerformanceTestingSpecification;
}
