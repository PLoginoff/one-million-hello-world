/**
 * RateLimitingOrSpecification
 */

import { IRateLimitingSpecification } from './IRateLimitingSpecification';
import { RateLimitingAndSpecification } from './RateLimitingAndSpecification';
import { RateLimitingNotSpecification } from './RateLimitingNotSpecification';

export class RateLimitingOrSpecification implements IRateLimitingSpecification {
  private _specs: IRateLimitingSpecification[];

  constructor(specs: IRateLimitingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingAndSpecification([this, other]);
  }

  or(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingOrSpecification([...this._specs, other]);
  }

  not(): IRateLimitingSpecification {
    return new RateLimitingNotSpecification(this);
  }

  getSpecifications(): IRateLimitingSpecification[] {
    return [...this._specs];
  }
}
