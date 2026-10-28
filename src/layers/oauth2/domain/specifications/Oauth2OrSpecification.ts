/**
 * Oauth2OrSpecification
 */

import { IOauth2Specification } from './IOauth2Specification';
import { Oauth2AndSpecification } from './Oauth2AndSpecification';
import { Oauth2NotSpecification } from './Oauth2NotSpecification';

export class Oauth2OrSpecification implements IOauth2Specification {
  private _specs: IOauth2Specification[];

  constructor(specs: IOauth2Specification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2AndSpecification([this, other]);
  }

  or(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2OrSpecification([...this._specs, other]);
  }

  not(): IOauth2Specification {
    return new Oauth2NotSpecification(this);
  }

  getSpecifications(): IOauth2Specification[] {
    return [...this._specs];
  }
}
