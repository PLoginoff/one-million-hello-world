/**
 * IAnalyticsSpecification interface
 */

export interface IAnalyticsSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IAnalyticsSpecification): IAnalyticsSpecification;
  or(other: IAnalyticsSpecification): IAnalyticsSpecification;
  not(): IAnalyticsSpecification;
}
