/**
 * IIdentitySpecification interface
 */

export interface IIdentitySpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IIdentitySpecification): IIdentitySpecification;
  or(other: IIdentitySpecification): IIdentitySpecification;
  not(): IIdentitySpecification;
}
