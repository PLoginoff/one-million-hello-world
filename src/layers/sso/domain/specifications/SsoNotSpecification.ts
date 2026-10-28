/**
 * SsoNotSpecification
 */

import { ISsoSpecification } from './ISsoSpecification';
import { SsoAndSpecification } from './SsoAndSpecification';
import { SsoOrSpecification } from './SsoOrSpecification';

export class SsoNotSpecification implements ISsoSpecification {
  private _spec: ISsoSpecification;

  constructor(spec: ISsoSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ISsoSpecification): ISsoSpecification {
    return new SsoAndSpecification([this, other]);
  }

  or(other: ISsoSpecification): ISsoSpecification {
    return new SsoOrSpecification([this, other]);
  }

  not(): ISsoSpecification {
    return this._spec;
  }

  getInner(): ISsoSpecification {
    return this._spec;
  }
}
