/**
 * EdgeCacheAndSpecification
 */

import { IEdgeCacheSpecification } from './IEdgeCacheSpecification';
import { EdgeCacheOrSpecification } from './EdgeCacheOrSpecification';
import { EdgeCacheNotSpecification } from './EdgeCacheNotSpecification';

export class EdgeCacheAndSpecification implements IEdgeCacheSpecification {
  private _specs: IEdgeCacheSpecification[];

  constructor(specs: IEdgeCacheSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheAndSpecification([...this._specs, other]);
  }

  or(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheOrSpecification([this, other]);
  }

  not(): IEdgeCacheSpecification {
    return new EdgeCacheNotSpecification(this);
  }

  getSpecifications(): IEdgeCacheSpecification[] {
    return [...this._specs];
  }
}
