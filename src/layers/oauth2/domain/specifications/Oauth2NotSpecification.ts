/**
 * Oauth2NotSpecification
 */

import { IOauth2Specification } from './IOauth2Specification';
import { Oauth2AndSpecification } from './Oauth2AndSpecification';
import { Oauth2OrSpecification } from './Oauth2OrSpecification';

export class Oauth2NotSpecification implements IOauth2Specification {
  private _spec: IOauth2Specification;

  constructor(spec: IOauth2Specification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2AndSpecification([this, other]);
  }

  or(other: IOauth2Specification): IOauth2Specification {
    return new Oauth2OrSpecification([this, other]);
  }

  not(): IOauth2Specification {
    return this._spec;
  }

  getInner(): IOauth2Specification {
    return this._spec;
  }
}
