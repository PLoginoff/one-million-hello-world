/**
 * AuthorizationNotSpecification
 */

import { IAuthorizationSpecification } from './IAuthorizationSpecification';
import { AuthorizationAndSpecification } from './AuthorizationAndSpecification';
import { AuthorizationOrSpecification } from './AuthorizationOrSpecification';

export class AuthorizationNotSpecification implements IAuthorizationSpecification {
  private _spec: IAuthorizationSpecification;

  constructor(spec: IAuthorizationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationAndSpecification([this, other]);
  }

  or(other: IAuthorizationSpecification): IAuthorizationSpecification {
    return new AuthorizationOrSpecification([this, other]);
  }

  not(): IAuthorizationSpecification {
    return this._spec;
  }

  getInner(): IAuthorizationSpecification {
    return this._spec;
  }
}
