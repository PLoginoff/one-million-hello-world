/**
 * RateLimitingAndSpecification
 */

import { IRateLimitingSpecification } from './IRateLimitingSpecification';
import { RateLimitingOrSpecification } from './RateLimitingOrSpecification';
import { RateLimitingNotSpecification } from './RateLimitingNotSpecification';

export class RateLimitingAndSpecification implements IRateLimitingSpecification {
  private _specs: IRateLimitingSpecification[];

  constructor(specs: IRateLimitingSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingAndSpecification([...this._specs, other]);
  }

  or(other: IRateLimitingSpecification): IRateLimitingSpecification {
    return new RateLimitingOrSpecification([this, other]);
  }

  not(): IRateLimitingSpecification {
    return new RateLimitingNotSpecification(this);
  }

  getSpecifications(): IRateLimitingSpecification[] {
    return [...this._specs];
  }
}
