/**
 * IRetrySpecification interface
 */

export interface IRetrySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IRetrySpecification): IRetrySpecification;
  or(other: IRetrySpecification): IRetrySpecification;
  not(): IRetrySpecification;
}
