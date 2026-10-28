/**
 * AuthorizationOrSpecification
 */

import { IAuthorizationSpecification } from './IAuthorizationSpecification';
import { AuthorizationAndSpecification } from './AuthorizationAndSpecification';
import { AuthorizationNotSpecification } from './AuthorizationNotSpecification';

export class AuthorizationOrSpecification implements IAuthorizationSpecification {
  private _specs: IAuthorizationSpecification[];

  constructor(specs: IAuthorizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationAndSpecification([this, other]);
  }

  or(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationOrSpecification([...this._specs, other]);
  }

  not(): IAuthorizationSpecification {
    return new AuthorizationNotSpecification(this);
  }

  getSpecifications(): IAuthorizationSpecification[] {
    return [...this._specs];
  }
}
