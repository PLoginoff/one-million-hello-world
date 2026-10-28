/**
 * IdentityProviderOrSpecification
 */

import { IIdentityProviderSpecification } from './IIdentityProviderSpecification';
import { IdentityProviderAndSpecification } from './IdentityProviderAndSpecification';
import { IdentityProviderNotSpecification } from './IdentityProviderNotSpecification';

export class IdentityProviderOrSpecification implements IIdentityProviderSpecification {
  private _specs: IIdentityProviderSpecification[];

  constructor(specs: IIdentityProviderSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderAndSpecification([this, other]);
  }

  or(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderOrSpecification([...this._specs, other]);
  }

  not(): IIdentityProviderSpecification {
    return new IdentityProviderNotSpecification(this);
  }

  getSpecifications(): IIdentityProviderSpecification[] {
    return [...this._specs];
  }
}
