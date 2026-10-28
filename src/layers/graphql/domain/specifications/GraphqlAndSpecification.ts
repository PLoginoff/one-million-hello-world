/**
 * GraphqlAndSpecification
 */

import { IGraphqlSpecification } from './IGraphqlSpecification';
import { GraphqlOrSpecification } from './GraphqlOrSpecification';
import { GraphqlNotSpecification } from './GraphqlNotSpecification';

export class GraphqlAndSpecification implements IGraphqlSpecification {
  private _specs: IGraphqlSpecification[];

  constructor(specs: IGraphqlSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.every((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlAndSpecification([...this._specs, other]);
  }

  or(other: IGraphqlSpecification): IGraphqlSpecification {
    return new GraphqlOrSpecification([this, other]);
  }

  not(): IGraphqlSpecification {
    return new GraphqlNotSpecification(this);
  }

  getSpecifications(): IGraphqlSpecification[] {
    return [...this._specs];
  }
}
