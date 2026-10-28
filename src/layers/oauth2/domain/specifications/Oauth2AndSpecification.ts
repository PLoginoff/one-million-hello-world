/**
 * Oauth2AndSpecification
 */

import { IOauth2Specification } from './IOauth2Specification';
import { Oauth2OrSpecification } from './Oauth2OrSpecification';
import { Oauth2NotSpecification } from './Oauth2NotSpecification';

export class Oauth2AndSpecification implements IOauth2Specification {
  private _specs: IOauth2Specification[];

  constructor(specs: IOauth2Specification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2AndSpecification([...this._specs, other]);
  }

  or(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2OrSpecification([this, other]);
  }

  not(): IOauth2Specification {
    return new Oauth2NotSpecification(this);
  }

  getSpecifications(): IOauth2Specification[] {
    return [...this._specs];
  }
}
