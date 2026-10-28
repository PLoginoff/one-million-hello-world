/**
 * IApiVersioningSpecification interface
 */

export interface IApiVersioningSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IApiVersioningSpecification): IApiVersioningSpecification;
  or(other: IApiVersioningSpecification): IApiVersioningSpecification;
  not(): IApiVersioningSpecification;
}
