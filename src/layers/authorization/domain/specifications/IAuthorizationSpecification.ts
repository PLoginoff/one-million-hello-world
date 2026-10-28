/**
 * IAuthorizationSpecification interface
 */

export interface IAuthorizationSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IAuthorizationSpecification): IAuthorizationSpecification;
  or(other: IAuthorizationSpecification): IAuthorizationSpecification;
  not(): IAuthorizationSpecification;
}
