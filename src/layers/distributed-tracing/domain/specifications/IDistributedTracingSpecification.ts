/**
 * IDistributedTracingSpecification interface
 */

export interface IDistributedTracingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IDistributedTracingSpecification): IDistributedTracingSpecification;
  or(other: IDistributedTracingSpecification): IDistributedTracingSpecification;
  not(): IDistributedTracingSpecification;
}
