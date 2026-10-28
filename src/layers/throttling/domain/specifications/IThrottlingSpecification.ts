/**
 * IThrottlingSpecification interface
 */

export interface IThrottlingSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IThrottlingSpecification): IThrottlingSpecification;
  or(other: IThrottlingSpecification): IThrottlingSpecification;
  not(): IThrottlingSpecification;
}
