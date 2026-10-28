/**
 * JwtValidationNotSpecification
 */

import { IJwtValidationSpecification } from './IJwtValidationSpecification';
import { JwtValidationAndSpecification } from './JwtValidationAndSpecification';
import { JwtValidationOrSpecification } from './JwtValidationOrSpecification';

export class JwtValidationNotSpecification implements IJwtValidationSpecification {
  private _spec: IJwtValidationSpecification;

  constructor(spec: IJwtValidationSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationAndSpecification([this, other]);
  }

  or(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationOrSpecification([this, other]);
  }

  not(): IJwtValidationSpecification {
    return this._spec;
  }

  getInner(): IJwtValidationSpecification {
    return this._spec;
  }
}
