/**
 * JwtValidationAndSpecification
 */

import { IJwtValidationSpecification } from './IJwtValidationSpecification';
import { JwtValidationOrSpecification } from './JwtValidationOrSpecification';
import { JwtValidationNotSpecification } from './JwtValidationNotSpecification';

export class JwtValidationAndSpecification implements IJwtValidationSpecification {
  private _specs: IJwtValidationSpecification[];

  constructor(specs: IJwtValidationSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationAndSpecification([...this._specs, other]);
  }

  or(other: IJwtValidationSpecification): IJwtValidationSpecification {
    return new JwtValidationOrSpecification([this, other]);
  }

  not(): IJwtValidationSpecification {
    return new JwtValidationNotSpecification(this);
  }

  getSpecifications(): IJwtValidationSpecification[] {
    return [...this._specs];
  }
}
