/**
 * IdentityProviderNotSpecification
 */

import { IIdentityProviderSpecification } from './IIdentityProviderSpecification';
import { IdentityProviderAndSpecification } from './IdentityProviderAndSpecification';
import { IdentityProviderOrSpecification } from './IdentityProviderOrSpecification';

export class IdentityProviderNotSpecification implements IIdentityProviderSpecification {
  private _spec: IIdentityProviderSpecification;

  constructor(spec: IIdentityProviderSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderAndSpecification([this, other]);
  }

  or(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderOrSpecification([this, other]);
  }

  not(): IIdentityProviderSpecification {
    return this._spec;
  }

  getInner(): IIdentityProviderSpecification {
    return this._spec;
  }
}
