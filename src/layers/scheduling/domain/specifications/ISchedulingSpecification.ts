/**
 * ISchedulingSpecification interface
 */

export interface ISchedulingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: ISchedulingSpecification): ISchedulingSpecification;
  or(other: ISchedulingSpecification): ISchedulingSpecification;
  not(): ISchedulingSpecification;
}
