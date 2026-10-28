/**
 * EdgeCacheNotSpecification
 */

import { IEdgeCacheSpecification } from './IEdgeCacheSpecification';
import { EdgeCacheAndSpecification } from './EdgeCacheAndSpecification';
import { EdgeCacheOrSpecification } from './EdgeCacheOrSpecification';

export class EdgeCacheNotSpecification implements IEdgeCacheSpecification {
  private _spec: IEdgeCacheSpecification;

  constructor(spec: IEdgeCacheSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheAndSpecification([this, other]);
  }

  or(other: IEdgeCacheSpecification): IEdgeCacheSpecification {
    return new EdgeCacheOrSpecification([this, other]);
  }

  not(): IEdgeCacheSpecification {
    return this._spec;
  }

  getInner(): IEdgeCacheSpecification {
    return this._spec;
  }
}
