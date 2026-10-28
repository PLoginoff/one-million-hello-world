/**
 * GraphqlOrSpecification
 */

import { IGraphqlSpecification } from './IGraphqlSpecification';
import { GraphqlAndSpecification } from './GraphqlAndSpecification';
import { GraphqlNotSpecification } from './GraphqlNotSpecification';

export class GraphqlOrSpecification implements IGraphqlSpecification {
  private _specs: IGraphqlSpecification[];

  constructor(specs: IGraphqlSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlAndSpecification([this, other]);
  }

  or(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlOrSpecification([...this._specs, other]);
  }

  not(): IGraphqlSpecification {
    return new GraphqlNotSpecification(this);
  }

  getSpecifications(): IGraphqlSpecification[] {
    return [...this._specs];
  }
}
