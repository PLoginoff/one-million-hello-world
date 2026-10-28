/**
 * CacheNotSpecification
 */

import { ICacheSpecification } from './ICacheSpecification';
import { CacheAndSpecification } from './CacheAndSpecification';
import { CacheOrSpecification } from './CacheOrSpecification';

export class CacheNotSpecification implements ICacheSpecification {
  private _spec: ICacheSpecification;

  constructor(spec: ICacheSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: ICacheSpecification): ICacheSpecification {
    return new CacheAndSpecification([this, other]);
  }

  or(other: ICacheSpecification): ICacheSpecification {
    return new CacheOrSpecification([this, other]);
  }

  not(): ICacheSpecification {
    return this._spec;
  }

  getInner(): ICacheSpecification {
    return this._spec;
  }
}
