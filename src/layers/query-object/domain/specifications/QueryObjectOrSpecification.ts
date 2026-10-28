/**
 * QueryObjectOrSpecification
 */

import { IQueryObjectSpecification } from './IQueryObjectSpecification';
import { QueryObjectAndSpecification } from './QueryObjectAndSpecification';
import { QueryObjectNotSpecification } from './QueryObjectNotSpecification';

export class QueryObjectOrSpecification implements IQueryObjectSpecification {
  private _specs: IQueryObjectSpecification[];

  constructor(specs: IQueryObjectSpecification[] = []) {
    this._specs = specs;
  }

  isSatisfiedBy(candidate: unknown): boolean {
    return this._specs.some((s) => s.isSatisfiedBy(candidate));
  }

  and(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectAndSpecification([this, other]);
  }

  or(other: IQueryObjectSpecification): IQueryObjectSpecification {
    return new QueryObjectOrSpecification([...this._specs, other]);
  }

  not(): IQueryObjectSpecification {
    return new QueryObjectNotSpecification(this);
  }

  getSpecifications(): IQueryObjectSpecification[] {
    return [...this._specs];
  }
}
