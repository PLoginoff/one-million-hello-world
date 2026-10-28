/**
 * GraphqlNotSpecification
 */

import { IGraphqlSpecification } from './IGraphqlSpecification';
import { GraphqlAndSpecification } from './GraphqlAndSpecification';
import { GraphqlOrSpecification } from './GraphqlOrSpecification';

export class GraphqlNotSpecification implements IGraphqlSpecification {
  private _spec: IGraphqlSpecification;

  constructor(spec: IGraphqlSpecification) {
    this._spec = spec;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return !this._spec.isSatisfiedBy(candidate);
  }

  and(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlAndSpecification([this, other]);
  }

  or(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlOrSpecification([this, other]);
  }

  not(): IGraphqlSpecification {
    return this._spec;
  }

  getInner(): IGraphqlSpecification {
    return this._spec;
  }
}
