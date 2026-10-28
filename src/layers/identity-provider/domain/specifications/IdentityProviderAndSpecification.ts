/**
 * IdentityProviderAndSpecification
 */

import { IIdentityProviderSpecification } from './IIdentityProviderSpecification';
import { IdentityProviderOrSpecification } from './IdentityProviderOrSpecification';
import { IdentityProviderNotSpecification } from './IdentityProviderNotSpecification';

export class IdentityProviderAndSpecification implements IIdentityProviderSpecification {
  private _specs: IIdentityProviderSpecification[];

  constructor(specs: IIdentityProviderSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderAndSpecification([...this._specs, other]);
  }

  or(other: IIdentityProviderSpecification): IIdentityProviderSpecification {
    return new IdentityProviderOrSpecification([this, other]);
  }

  not(): IIdentityProviderSpecification {
    return new IdentityProviderNotSpecification(this);
  }

  getSpecifications(): IIdentityProviderSpecification[] {
    return [...this._specs];
  }
}
