/**
 * JwtValidationOrSpecification
 */

import { IJwtValidationSpecification } from './IJwtValidationSpecification';
import { JwtValidationAndSpecification } from './JwtValidationAndSpecification';
import { JwtValidationNotSpecification } from './JwtValidationNotSpecification';

export class JwtValidationOrSpecification implements IJwtValidationSpecification {
  private _specs: IJwtValidationSpecification[];

  constructor(specs: IJwtValidationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationAndSpecification([this, other]);
  }

  or(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationOrSpecification([...this._specs, other]);
  }

  not(): IJwtValidationSpecification {
    return new JwtValidationNotSpecification(this);
  }

  getSpecifications(): IJwtValidationSpecification[] {
    return [...this._specs];
  }
}
