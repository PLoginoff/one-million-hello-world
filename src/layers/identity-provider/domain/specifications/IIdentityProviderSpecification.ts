/**
 * IIdentityProviderSpecification interface
 */

export interface IIdentityProviderSpecification {
  isSatisfiedBy(candidate: unknown): boolean;
  and(other: IIdentityProviderSpecification): IIdentityProviderSpecification;
  or(other: IIdentityProviderSpecification): IIdentityProviderSpecification;
  not(): IIdentityProviderSpecification;
}
