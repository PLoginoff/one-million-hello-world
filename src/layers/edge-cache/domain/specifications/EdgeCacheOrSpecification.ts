/**
 * EdgeCacheOrSpecification
 */

import { IEdgeCacheSpecification } from './IEdgeCacheSpecification';
import { EdgeCacheAndSpecification } from './EdgeCacheAndSpecification';
import { EdgeCacheNotSpecification } from './EdgeCacheNotSpecification';

export class EdgeCacheOrSpecification implements IEdgeCacheSpecification {
  private _specs: IEdgeCacheSpecification[];

  constructor(specs: IEdgeCacheSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheAndSpecification([this, other]);
  }

  or(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheOrSpecification([...this._specs, other]);
  }

  not(): IEdgeCacheSpecification {
    return new EdgeCacheNotSpecification(this);
  }

  getSpecifications(): IEdgeCacheSpecification[] {
    return [...this._specs];
  }
}
