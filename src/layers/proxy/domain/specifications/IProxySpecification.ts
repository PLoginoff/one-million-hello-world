/**
 * IProxySpecification interface
 */

export interface IProxySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IProxySpecification): IProxySpecification;
  or(other: IProxySpecification): IProxySpecification;
  not(): IProxySpecification;
}
