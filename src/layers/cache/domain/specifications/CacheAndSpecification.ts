/**
 * CacheAndSpecification
 */

import { ICacheSpecification } from './ICacheSpecification';
import { CacheOrSpecification } from './CacheOrSpecification';
import { CacheNotSpecification } from './CacheNotSpecification';

export class CacheAndSpecification implements ICacheSpecification {
  private _specs: ICacheSpecification[];

  constructor(specs: ICacheSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: ICacheSpecification): ICacheSpecification {
    return new CacheAndSpecification([...this._specs, other]);
  }

  or(other: ICacheSpecification): ICacheSpecification {
    return new CacheOrSpecification([this, other]);
  }

  not(): ICacheSpecification {
    return new CacheNotSpecification(this);
  }

  getSpecifications(): ICacheSpecification[] {
    return [...this._specs];
  }
}
