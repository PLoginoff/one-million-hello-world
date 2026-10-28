/**
 * AuthorizationAndSpecification
 */

import { IAuthorizationSpecification } from './IAuthorizationSpecification';
import { AuthorizationOrSpecification } from './AuthorizationOrSpecification';
import { AuthorizationNotSpecification } from './AuthorizationNotSpecification';

export class AuthorizationAndSpecification implements IAuthorizationSpecification {
  private _specs: IAuthorizationSpecification[];

  constructor(specs: IAuthorizationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationAndSpecification([...this._specs, other]);
  }

  or(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationOrSpecification([this, other]);
  }

  not(): IAuthorizationSpecification {
    return new AuthorizationNotSpecification(this);
  }

  getSpecifications(): IAuthorizationSpecification[] {
    return [...this._specs];
  }
}
