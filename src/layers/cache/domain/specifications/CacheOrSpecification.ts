/**
 * CacheOrSpecification
 */

import { ICacheSpecification } from './ICacheSpecification';
import { CacheAndSpecification } from './CacheAndSpecification';
import { CacheNotSpecification } from './CacheNotSpecification';

export class CacheOrSpecification implements ICacheSpecification {
  private _specs: ICacheSpecification[];

  constructor(specs: ICacheSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICacheSpecification): ICacheSpecification {
    return new CacheAndSpecification([this, other]);
  }

  or(other: ICacheSpecification): ICacheSpecification {
    return new CacheOrSpecification([...this._specs, other]);
  }

  not(): ICacheSpecification {
    return new CacheNotSpecification(this);
  }

  getSpecifications(): ICacheSpecification[] {
    return [...this._specs];
  }
}
