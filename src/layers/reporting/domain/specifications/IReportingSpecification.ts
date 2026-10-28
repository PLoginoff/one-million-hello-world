/**
 * IReportingSpecification interface
 */

export interface IReportingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IReportingSpecification): IReportingSpecification;
  or(other: IReportingSpecification): IReportingSpecification;
  not(): IReportingSpecification;
}
