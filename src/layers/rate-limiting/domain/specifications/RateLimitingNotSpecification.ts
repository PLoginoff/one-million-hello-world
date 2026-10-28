/**
 * RateLimitingNotSpecification
 */

import { IRateLimitingSpecification } from './IRateLimitingSpecification';
import { RateLimitingAndSpecification } from './RateLimitingAndSpecification';
import { RateLimitingOrSpecification } from './RateLimitingOrSpecification';

export class RateLimitingNotSpecification implements IRateLimitingSpecification {
  private _spec: IRateLimitingSpecification;

  constructor(spec: IRateLimitingSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingAndSpecification([this, other]);
  }

  or(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingOrSpecification([this, other]);
  }

  not(): IRateLimitingSpecification {
    return this._spec;
  }

  getInner(): IRateLimitingSpecification {
    return this._spec;
  }
}
