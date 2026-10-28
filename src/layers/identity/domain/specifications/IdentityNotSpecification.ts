/**
 * IdentityNotSpecification
 */

import { IIdentitySpecification } from './IIdentitySpecification';
import { IdentityAndSpecification } from './IdentityAndSpecification';
import { IdentityOrSpecification } from './IdentityOrSpecification';

export class IdentityNotSpecification implements IIdentitySpecification {
  private _spec: IIdentitySpecification;

  constructor(spec: IIdentitySpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityAndSpecification([this, other]);
  }

  or(other: IIdentitySpecification): IIdentitySpecification {
    return new IdentityOrSpecification([this, other]);
  }

  not(): IIdentitySpecification {
    return this._spec;
  }

  getInner(): IIdentitySpecification {
    return this._spec;
  }
}
